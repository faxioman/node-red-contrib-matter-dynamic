const { Endpoint, Environment, ServerNode, Logger, VendorId, StorageService, DeviceCommissioner } = require("@matter/main");
const crypto = require('crypto');
const { AggregatorEndpoint } = require("@matter/main/endpoints");
const { NetworkCommissioning } = require("@matter/main/clusters");
const { NetworkCommissioningServer } = require("@matter/main/behaviors");
const os = require('os');
const QRCode = require('qrcode');

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate a valid Matter passcode
 */
function generatePasscode() {
    let passcode = Math.floor(Math.random() * 99999997) + 1;
    const invalidCodes = [
        11111111, 22222222, 33333333, 44444444, 55555555, 
        66666666, 77777777, 88888888, 12345678, 87654321
    ];
    
    if (invalidCodes.includes(passcode)) {
        passcode += 1;
    }
    
    return +passcode.toString().padStart(8, '0');
}

/**
 * Generate a random discriminator (0-4095)
 */
function generateDiscriminator() {
    return Math.floor(Math.random() * 4095);
}

// ============================================================================
// BRIDGE CONFIGURATION
// ============================================================================

class BridgeConfig {
    constructor(config) {
        this.name = config.name || "Matter Bridge";
        this.vendorId = +config.vendorId || 65521;
        this.productId = +config.productId || 32768;
        this.vendorName = config.vendorName || "Node-RED";
        this.productName = config.productName || "Dynamic Matter Bridge";
        this.networkInterface = config.networkInterface || "";
        this.storageLocation = config.storageLocation || "";
        this.port = config.port || 5540;
        this.logLevel = config.logLevel || "WARN";
        this.passcode = generatePasscode();
        this.discriminator = generateDiscriminator();
    }
    
    /**
     * Apply log level configuration
     */
    static setLogLevel(level) {
        const logLevels = {
            "FATAL": 5,
            "ERROR": 4,
            "WARN": 3,
            "INFO": 1,
            "DEBUG": 0
        };
        
        if (level in logLevels) {
            Logger.defaultLogLevel = logLevels[level];
        }
    }
}

// ============================================================================
// DEVICE MANAGER
// ============================================================================

class DeviceManager {
    constructor(node) {
        this.node = node;
        this.registered = [];
        this.pendingUsers = [];
        this.failedDevices = new Set();
    }
    
    /**
     * Register a child device with the bridge
     */
    registerChild(child) {
        this.node.log(`Registering device ${child.id}`);
        
        // Check if already registered
        if (this.registered.find(c => c.id === child.id)) {
            this.node.warn(`Device ${child.id} already registered, skipping`);
            return;
        }
        
        // Remove from pending users
        const index = this.pendingUsers.indexOf(child.id);
        if (index > -1) {
            this.pendingUsers.splice(index, 1);
        }
        
        this.registered.push(child);
        
        // Add device to aggregator
        this.addToAggregator(child);
        
        // Start server when all devices registered
        if (this.pendingUsers.length === 0 && this.node.serverReady) {
            this.node.serverManager.start();
        }
    }
    
    /**
     * Add device to Matter aggregator
     */
    addToAggregator(child) {
        const deviceId = child.id.replace(/-/g, '');
        
        if (!this.node.aggregator) {
            this.node.error("Aggregator not ready");
            return;
        }
        
        if (this.node.aggregator.parts.has(deviceId)) {
            this.node.warn(`Device ${deviceId} already in aggregator, skipping add`);
            child.deviceAddedSuccessfully = true;
            return;
        }
        
        try {
            this.node.aggregator.add(child.device);
            this.node.log(`Added device ${deviceId} to aggregator`);
            child.deviceAddedSuccessfully = true;
        } catch (error) {
            this.handleDeviceError(child, error);
        }
    }
    
    /**
     * Handle device initialization error
     */
    handleDeviceError(child, error) {
        this.node.error(`Failed to add device ${child.id}: ${error.message}`);
        child.error(`Device initialization failed: ${error.message}`);
        child.status({fill:"red", shape:"ring", text:"init failed"});
        child.deviceAddedSuccessfully = false;
        this.failedDevices.add(child.id);
    }
    
    /**
     * Notify all registered devices that server is ready
     */
    notifyDevicesReady() {
        setTimeout(() => {
            this.registered.forEach(child => {
                if (this.failedDevices.has(child.id) || child.deviceInitFailed) {
                    return;
                }
                
                try {
                    if (child.device?.state) {
                        // Test device accessibility
                        const test = Object.keys(child.device.state);
                        child.emit('serverReady');
                    } else {
                        child.error("Device not properly initialized");
                        child.status({fill:"red", shape:"ring", text:"init failed"});
                    }
                } catch (err) {
                    child.error(`Device validation check failed: ${err.message}`);
                    child.status({fill:"red", shape:"ring", text:"validation failed"});
                    this.failedDevices.add(child.id);
                }
            });
        }, 3000);
    }
}

// ============================================================================
// SERVER MANAGER
// ============================================================================

class ServerManager {
    constructor(node) {
        this.node = node;
    }
    
    /**
     * Create and configure Matter server
     */
    async create() {
        // Configure environment
        this.configureEnvironment();
        
        // Create server configuration
        const serverConfig = this.createServerConfig();
        
        try {
            const matterServer = await ServerNode.create(
                ServerNode.RootEndpoint.with(
                    NetworkCommissioningServer.with("EthernetNetworkInterface")
                ),
                serverConfig
            );
            
            this.node.matterServer = matterServer;
            this.node.aggregator = new Endpoint(AggregatorEndpoint, { id: "aggregator" });
            this.node.matterServer.add(this.node.aggregator);
            
            this.node.log("Bridge created");
            this.node.serverReady = true;
            
            // Start if no child nodes configured
            if (this.node.deviceManager.pendingUsers.length === 0) {
                this.start();
            }
        } catch (err) {
            this.node.error("Failed to create Matter server: " + err.message);
        }
    }
    
    /**
     * Configure Matter environment settings
     */
    configureEnvironment() {
        const config = this.node.bridgeConfig;
        
        if (config.networkInterface) {
            Environment.default.vars.set('mdns.networkInterface', config.networkInterface);
        }
        
        if (config.storageLocation) {
            const storageService = Environment.default.get(StorageService);
            storageService.location = config.storageLocation;
            Environment.default.set(StorageService, storageService);
            this.node.log(`Using custom storage: ${storageService.location}`);
        }
    }
    
    /**
     * Create server configuration object
     */
    createServerConfig() {
        const config = this.node.bridgeConfig;
        const networkId = new Uint8Array(32);
        
        return {
            id: this.node.id,
            network: {
                port: config.port,
            },
            commissioning: {
                passcode: config.passcode,
                discriminator: config.discriminator
            },
            productDescription: {
                name: config.name,
                deviceType: AggregatorEndpoint.deviceType,
            },
            basicInformation: {
                vendorName: config.vendorName,
                vendorId: VendorId(config.vendorId),
                nodeLabel: config.name,
                productName: config.productName,
                productLabel: config.name,
                productId: config.productId,
                serialNumber: this.node.id.replace(/-/g, ''),
                uniqueId: this.node.id.replace(/-/g, '').split("").reverse().join(""),
                hardwareVersion: 1,
                softwareVersion: 1
            },
            networkCommissioning: {
                maxNetworks: 1,
                interfaceEnabled: true,
                lastConnectErrorValue: 0,
                lastNetworkId: networkId,
                lastNetworkingStatus: NetworkCommissioning.NetworkCommissioningStatus.Success,
                networks: [{ networkId: networkId, connected: true }],
            }
        };
    }
    
    /**
     * Start Matter server
     */
    async start() {
        if (!this.node.serverReady || !this.node.matterServer) {
            return;
        }
        
        if (this.node.matterServer.lifecycle.isOnline) {
            // Server already running
            this.node.deviceManager.notifyDevicesReady();
            return;
        }
        
        this.node.log('Starting Matter server...');
        
        try {
            await this.node.matterServer.start();
            this.node.log('Matter server started');
            
            this.updateNodeStatus();
            this.node.deviceManager.notifyDevicesReady();
        } catch (err) {
            this.node.error('Failed to start server: ' + err.message);
        }
    }
    
    /**
     * Update node status based on commissioning state
     */
    updateNodeStatus() {
        if (!this.node.matterServer.lifecycle.isCommissioned) {
            const pairingData = this.node.matterServer.state.commissioning.pairingCodes;
            
            this.node.status({
                fill: "blue",
                shape: "dot",
                text: `QR: ${pairingData.manualPairingCode}`
            });
            
            // Store QR data for display
            this.node.qrCode = pairingData.qrPairingCode;
            this.node.manualCode = pairingData.manualPairingCode;
        } else {
            this.node.status({
                fill: "green",
                shape: "dot",
                text: "commissioned"
            });
        }
    }
}

// ============================================================================
// ERROR HANDLER
// ============================================================================

class ErrorHandler {
    constructor(node) {
        this.node = node;
        this.handler = this.handleUnhandledRejection.bind(this);
        process.on('unhandledRejection', this.handler);
    }
    
    /**
     * Handle unhandled Matter.js initialization errors
     */
    handleUnhandledRejection(reason, promise) {
        if (!reason?.message?.includes('Behaviors have errors')) {
            return;
        }
        
        this.node.error(`Matter.js initialization error: ${reason.message}`);
        
        // Extract detailed error information
        if (reason.errors?.length > 0) {
            reason.errors.forEach(err => {
                if (err.cause) {
                    this.node.error(`Device validation error: ${err.cause.message}`);
                }
            });
        }
        
        // Find which device failed
        const errorStr = reason.toString();
        const deviceMatch = errorStr.match(/Error initializing ([a-f0-9]+)\.aggregator\.([a-f0-9]+)/);
        
        if (deviceMatch?.[2]) {
            this.handleFailedDevice(deviceMatch[2], errorStr);
        }
    }
    
    /**
     * Handle a failed device initialization
     */
    handleFailedDevice(failedDeviceId, errorStr) {
        const failedChild = this.node.deviceManager.registered.find(child => 
            child.id.replace(/-/g, '') === failedDeviceId
        );
        
        if (!failedChild) return;
        
        const validationMatch = errorStr.match(/Validating [^:]+: (.+)/);
        const errorMsg = validationMatch?.[1] || 'Missing mandatory attributes';
        
        failedChild.error(`Device initialization failed: ${errorMsg}`);
        failedChild.status({fill:"red", shape:"ring", text:"validation error"});
        failedChild.deviceInitFailed = true;
        failedChild.eventsSubscribed = true; // Prevent future subscription attempts
        
        this.node.deviceManager.failedDevices.add(failedChild.id);
        
        // Emit failure event
        failedChild.emit('deviceInitFailed', errorMsg);
        failedChild.removeAllListeners('serverReady');
        
        // Try to clean up from aggregator
        this.cleanupFailedDevice(failedDeviceId);
    }
    
    /**
     * Clean up failed device from aggregator
     */
    cleanupFailedDevice(deviceId) {
        try {
            if (this.node.aggregator?.parts.has(deviceId)) {
                this.node.aggregator.parts.delete(deviceId);
            }
        } catch (e) {
            // Ignore cleanup errors
        }
    }
    
    /**
     * Clean up error handler
     */
    cleanup() {
        process.removeListener('unhandledRejection', this.handler);
    }
}

// ============================================================================
// HTTP API HANDLER
// ============================================================================

class HttpApiHandler {
    static setupEndpoints(RED) {
        // Get QR code endpoint
        RED.httpAdmin.get('/_matterbridge/qrcode/:id', 
            RED.auth.needsPermission('admin.write'), 
            this.getQrCode.bind(this, RED)
        );
        
        // Get commissioning info
        RED.httpAdmin.get('/_matterbridge/commissioning/:id', 
            RED.auth.needsPermission('admin.write'), 
            this.getCommissioningInfo.bind(this, RED)
        );
        
        // Get network interfaces
        RED.httpAdmin.get('/_matterbridge/interfaces', 
            RED.auth.needsPermission('admin.write'), 
            this.getNetworkInterfaces.bind(this)
        );
    }
    
    static async getQrCode(RED, req, res) {
        const targetNode = RED.nodes.getNode(req.params.id);
        if (!targetNode) {
            return res.json({ error: "Bridge not found" });
        }
        
        try {
            const data = await this.getQrCodeData(targetNode);
            res.json(data);
        } catch (err) {
            res.json({ error: err.message });
        }
    }
    
    static async getCommissioningInfo(RED, req, res) {
        const targetNode = RED.nodes.getNode(req.params.id);
        if (!targetNode?.matterServer) {
            return res.sendStatus(404);
        }
        
        if (!targetNode.matterServer.lifecycle.isCommissioned) {
            const data = await this.generatePairingData(targetNode);
            res.json(data);
        } else {
            res.json({ state: 'commissioned' });
        }
    }
    
    
    static getNetworkInterfaces(req, res) {
        const interfaces = os.networkInterfaces();
        const output = [];
        
        for (const iface in interfaces) {
            for (const addr of interfaces[iface]) {
                if (!addr.internal && addr.family === "IPv6") {
                    output.push(iface);
                    break;
                }
            }
        }
        
        res.json([...new Set(output)]);
    }
    
    static async getQrCodeData(node) {
        if (node.qrCode) {
            return await this.formatQrResponse(
                node.qrCode, 
                node.manualCode,
                node.matterServer?.lifecycle?.isCommissioned
            );
        }
        
        if (node.matterServer && !node.matterServer.lifecycle.isCommissioned) {
            const pairingData = node.matterServer.state.commissioning.pairingCodes;
            return await this.formatQrResponse(
                pairingData.qrPairingCode,
                pairingData.manualPairingCode,
                false
            );
        }
        
        return { commissioned: true };
    }
    
    static async generatePairingData(node) {
        const pairingData = node.matterServer.state.commissioning.pairingCodes;
        
        try {
            const qrSvg = await QRCode.toString(pairingData.qrPairingCode, {
                type: 'svg',
                width: 200,
                margin: 1
            });
            
            return {
                state: 'ready',
                qrPairingCode: pairingData.qrPairingCode,
                qrSvg: qrSvg,
                manualPairingCode: pairingData.manualPairingCode
            };
        } catch (err) {
            return {
                state: 'ready',
                qrPairingCode: pairingData.qrPairingCode,
                manualPairingCode: pairingData.manualPairingCode
            };
        }
    }
    
    static async formatQrResponse(qrCode, manualCode, commissioned = false) {
        try {
            const qrSvg = await QRCode.toString(qrCode, {
                type: 'svg',
                width: 200,
                margin: 1
            });
            
            return {
                qrCode,
                qrSvg,
                manualCode,
                commissioned
            };
        } catch (err) {
            return {
                qrCode,
                manualCode,
                commissioned
            };
        }
    }
}

// ============================================================================
// MAIN NODE DEFINITION
// ============================================================================

module.exports = function(RED) {
    function MatterDynamicBridge(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        
        // Initialize configuration
        node.bridgeConfig = new BridgeConfig(config);
        BridgeConfig.setLogLevel(node.bridgeConfig.logLevel);
        
        node.log(`Loading Matter Bridge ${node.id}`);
        
        // Initialize managers
        node.deviceManager = new DeviceManager(node);
        node.serverManager = new ServerManager(node);
        node.errorHandler = new ErrorHandler(node);
        
        // Initialize state
        node.serverReady = false;
        node.users = node.deviceManager.pendingUsers;
        node.registered = node.deviceManager.registered;
        
        // Register child device function
        node.registerChild = node.deviceManager.registerChild.bind(node.deviceManager);
        
        // Create Matter server
        node.serverManager.create();
        
        // ====================================================================
        // EVENT HANDLERS
        // ====================================================================
        
        // Handle flow start events
        RED.events.on("flows:started", function(flow) {
            const disabledFlows = [];
            
            flow.config.flows.forEach(x => {
                if (x.type === 'tab' && x.disabled) {
                    disabledFlows.push(x.id);
                }
                
                if (x.d || disabledFlows.includes(x.z)) {
                    const index = node.users.indexOf(x.id);
                    if (index > -1) {
                        node.log('Skipping disabled node: ' + x.id);
                        node.users.splice(index, 1);
                    }
                }
            });
        });
        
        // ====================================================================
        // CLEANUP
        // ====================================================================
        
        this.on('close', async function(removed, done) {
            node.errorHandler.cleanup();
            
            if (node.matterServer) {
                node.log(removed ? "Bridge removed" : "Bridge restarted");
                await node.matterServer.close();
            }
            
            done();
        });
    }
    
    RED.nodes.registerType("matter-dynamic-bridge", MatterDynamicBridge);
    
    // Setup HTTP API endpoints  
    HttpApiHandler.setupEndpoints(RED);
};