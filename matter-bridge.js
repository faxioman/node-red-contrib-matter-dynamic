const { Endpoint, Environment, ServerNode, Logger, VendorId, StorageService } = require("@matter/main");
const { AggregatorEndpoint } = require("@matter/main/endpoints");
const { DeviceCommisioner } = require("@matter/main/protocol");
const { NetworkCommissioning } = require("@matter/main/clusters");
const { NetworkCommissioningServer } = require("@matter/main/behaviors");
const os = require('os');

function genPasscode() {
    let x = Math.floor(Math.random() * (99999998 - 1) + 1);
    const invalid = [11111111, 22222222, 33333333, 44444444, 55555555, 66666666, 77777777, 88888888, 12345678, 87654321];
    if (invalid.includes(x)) {
        x += 1;
    }
    return +x.toString().padStart(8, '0');
}

module.exports = function(RED) {
    function MatterDynamicBridge(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        
        // Catch unhandled Matter.js errors
        const unhandledRejectionHandler = (reason, promise) => {
            if (reason && reason.message && reason.message.includes('Behaviors have errors')) {
                node.error(`Matter.js initialization error: ${reason.message}`);
                // Extract detailed error information
                if (reason.errors && reason.errors.length > 0) {
                    reason.errors.forEach(err => {
                        if (err.cause) {
                            node.error(`Device validation error: ${err.cause.message}`);
                        }
                    });
                }
                // Find which device failed
                const errorStr = reason.toString();
                const deviceMatch = errorStr.match(/Error initializing ([a-f0-9]+)\.aggregator\.([a-f0-9]+)/);
                if (deviceMatch && deviceMatch[2]) {
                    const failedDeviceId = deviceMatch[2];
                    const failedChild = node.registered.find(child => 
                        child.id.replace(/-/g, '') === failedDeviceId
                    );
                    if (failedChild) {
                        const validationMatch = errorStr.match(/Validating [^:]+: (.+)/);
                        const errorMsg = validationMatch ? validationMatch[1] : 'Missing mandatory attributes';
                        failedChild.error(`Device initialization failed: ${errorMsg}`);
                        failedChild.status({fill:"red", shape:"ring", text:"validation error"});
                        failedChild.deviceInitFailed = true;
                        failedChild.eventsSubscribed = true; // Prevent future subscription attempts
                        node.failedDevices.add(failedChild.id);
                        
                        // Emit failure event directly to device
                        failedChild.emit('deviceInitFailed', errorMsg);
                        
                        // Remove all event listeners if any
                        failedChild.removeAllListeners('serverReady');
                        
                        // Remove from aggregator if possible
                        try {
                            if (node.aggregator && node.aggregator.parts.has(failedDeviceId)) {
                                node.aggregator.parts.delete(failedDeviceId);
                            }
                        } catch (e) {
                            // Ignore cleanup errors
                        }
                    }
                }
                return; // Prevent crash
            }
        };
        
        process.on('unhandledRejection', unhandledRejectionHandler);
        
        // Clean up handler on close
        node.on('close', (removed, done) => {
            process.removeListener('unhandledRejection', unhandledRejectionHandler);
            done();
        });
        
        // Set log level
        switch (config.logLevel) {
            case "FATAL": Logger.defaultLogLevel = 5; break;
            case "ERROR": Logger.defaultLogLevel = 4; break;
            case "WARN": Logger.defaultLogLevel = 3; break;
            case "INFO": Logger.defaultLogLevel = 1; break;
            case "DEBUG": Logger.defaultLogLevel = 0; break;
        }
        
        node.log(`Loading Matter Bridge ${node.id}`);
        
        // Bridge configuration
        node.name = config.name || "Matter Bridge";
        node.vendorId = +config.vendorId || 65521;
        node.productId = +config.productId || 32768;
        node.vendorName = config.vendorName || "Node-RED";
        node.productName = config.productName || "Dynamic Matter Bridge";
        node.networkInterface = config.networkInterface || "";
        node.storageLocation = config.storageLocation || "";
        node.port = config.port || 5540;
        node.passcode = genPasscode();
        node.discriminator = +Math.floor(Math.random() * 4095).toString().padStart(4, '0');
        
        node.serverReady = false;
        node.registered = [];
        node.users = [];
        node.failedDevices = new Set(); // Track failed devices
        
        // Child nodes will be added dynamically when they connect
        
        // Configure environment
        if (node.networkInterface) {
            Environment.default.vars.set('mdns.networkInterface', node.networkInterface);
        }
        
        // Configure storage
        const environment = Environment.default;
        let storageService = environment.get(StorageService);
        if (node.storageLocation) {
            storageService.location = node.storageLocation;
            environment.set(StorageService, storageService);
            node.log(`Using custom storage: ${storageService.location}`);
        }
        
        // Create Matter server
        const networkId = new Uint8Array(32);
        
        ServerNode.create(
            ServerNode.RootEndpoint.with(NetworkCommissioningServer.with("EthernetNetworkInterface")),
            {
                id: node.id,
                network: {
                    port: node.port,
                },
                commissioning: {
                    passcode: node.passcode,
                    discriminator: node.discriminator
                },
                productDescription: {
                    name: node.name,
                    deviceType: AggregatorEndpoint.deviceType,
                },
                basicInformation: {
                    vendorName: node.vendorName,
                    vendorId: VendorId(node.vendorId),
                    nodeLabel: node.name,
                    productName: node.productName,
                    productLabel: node.name,
                    productId: node.productId,
                    serialNumber: node.id.replace(/-/g, ''),
                    uniqueId: node.id.replace(/-/g, '').split("").reverse().join(""),
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
            }
        ).then((matterServer) => {
            node.aggregator = new Endpoint(AggregatorEndpoint, { id: "aggregator" });
            node.matterServer = matterServer;
            node.matterServer.add(node.aggregator);
            node.log("Bridge created");
            node.serverReady = true;
            
            // Start server if no child nodes configured
            if (node.users.length === 0) {
                startServer();
            }
        }).catch((err) => {
            node.error("Failed to create Matter server: " + err.message);
        });
        
        function startServer() {
            if (node.serverReady && !node.matterServer.lifecycle.isOnline) {
                node.log('Starting Matter server...');
                node.matterServer.start().then(() => {
                    node.log('Matter server started');
                    // Delay to ensure all device initialization errors are caught
                    setTimeout(() => {
                        node.registered.forEach(child => {
                            if (!node.failedDevices.has(child.id) && !child.deviceInitFailed) {
                                // Test if device is actually accessible before notifying
                                try {
                                    if (child.device && child.device.state) {
                                        // Try to access the device to trigger any initialization errors
                                        const test = Object.keys(child.device.state);
                                        child.emit('serverReady');
                                    } else {
                                        child.error("Device not properly initialized");
                                        child.status({fill:"red", shape:"ring", text:"init failed"});
                                    }
                                } catch (err) {
                                    child.error(`Device validation check failed: ${err.message}`);
                                    child.status({fill:"red", shape:"ring", text:"validation failed"});
                                    node.failedDevices.add(child.id);
                                }
                            }
                        });
                    }, 3000);
                }).catch((err) => {
                    node.error('Failed to start server: ' + err.message);
                });
            } else if (node.serverReady && node.matterServer.lifecycle.isOnline) {
                // Server already running, notify children
                setTimeout(() => {
                    node.registered.forEach(child => {
                        if (!node.failedDevices.has(child.id) && !child.deviceInitFailed) {
                            // Test if device is actually accessible before notifying
                            try {
                                if (child.device && child.device.state) {
                                    // Try to access the device to trigger any initialization errors
                                    const test = Object.keys(child.device.state);
                                    child.emit('serverReady');
                                } else {
                                    child.error("Device not properly initialized");
                                    child.status({fill:"red", shape:"ring", text:"init failed"});
                                }
                            } catch (err) {
                                child.error(`Device validation check failed: ${err.message}`);
                                child.status({fill:"red", shape:"ring", text:"validation failed"});
                                node.failedDevices.add(child.id);
                            }
                        }
                    });
                }, 3000);
            }
        }
        
        // Function to register child devices
        node.registerChild = function(child) {
            node.log(`Registering device ${child.id}`);
            
            // Check if already registered
            if (node.registered.find(c => c.id === child.id)) {
                node.warn(`Device ${child.id} already registered, skipping`);
                return;
            }
            
            // Remove from pending users
            const index = node.users.indexOf(child.id);
            if (index > -1) {
                node.users.splice(index, 1);
            }
            
            node.registered.push(child);
            
            // Add device to aggregator
            const deviceId = child.id.replace(/-/g, '');
            if (node.aggregator && !node.aggregator.parts.has(deviceId)) {
                try {
                    node.aggregator.add(child.device);
                    node.log(`Added device ${deviceId} to aggregator`);
                    child.deviceAddedSuccessfully = true;
                } catch (error) {
                    node.error(`Failed to add device ${child.id}: ${error.message}`);
                    child.error(`Device initialization failed: ${error.message}`);
                    child.status({fill:"red", shape:"ring", text:"init failed"});
                    child.deviceAddedSuccessfully = false;
                }
            }
            
            // Start server when all devices registered
            if (node.users.length === 0) {
                startServer();
            }
        };
        
        this.on('close', async function(removed, done) {
            process.removeListener('unhandledRejection', unhandledRejectionHandler);
            if (node.matterServer) {
                node.log(removed ? "Bridge removed" : "Bridge restarted");
                await node.matterServer.close();
            }
            done();
        });
        
        // Remove disabled nodes from users list
        RED.events.on("flows:started", function(flow) {
            let disabledFlows = [];
            flow.config.flows.forEach(x => {
                if (x.type === 'tab' && x.disabled) {
                    disabledFlows.push(x.id);
                }
                if (x.d || disabledFlows.includes(x.z)) {
                    let index = node.users.indexOf(x.id);
                    if (index > -1) {
                        node.log('Skipping disabled node: ' + x.id);
                        node.users.splice(index, 1);
                    }
                }
            });
        });
    }
    
    RED.nodes.registerType("matter-dynamic-bridge", MatterDynamicBridge);
    
    // HTTP endpoints for commissioning
    RED.httpAdmin.get('/_matterbridge/commissioning/:id', RED.auth.needsPermission('admin.write'), function(req, res) {
        let targetNode = RED.nodes.getNode(req.params.id);
        if (targetNode && targetNode.matterServer) {
            if (!targetNode.matterServer.lifecycle.isCommissioned) {
                const pairingData = targetNode.matterServer.state.commissioning.pairingCodes;
                res.json({
                    state: 'ready',
                    qrPairingCode: pairingData.qrPairingCode,
                    manualPairingCode: pairingData.manualPairingCode
                });
            } else {
                res.json({ state: 'commissioned' });
            }
        } else {
            res.sendStatus(404);
        }
    });
    
    RED.httpAdmin.get('/_matterbridge/reopen/:id', RED.auth.needsPermission('admin.write'), function(req, res) {
        let targetNode = RED.nodes.getNode(req.params.id);
        if (targetNode && targetNode.matterServer) {
            let commisioner = targetNode.matterServer.env.get(DeviceCommisioner);
            commisioner.allowBasicCommissioning().then(() => {
                const pairingData = targetNode.matterServer.state.commissioning.pairingCodes;
                res.json({
                    state: 'ready',
                    qrPairingCode: pairingData.qrPairingCode,
                    manualPairingCode: pairingData.manualPairingCode
                });
            });
        } else {
            res.sendStatus(404);
        }
    });
    
    RED.httpAdmin.get('/_matterbridge/interfaces', RED.auth.needsPermission('admin.write'), function(req, res) {
        let interfaces = os.networkInterfaces();
        let output = [];
        for (let iface in interfaces) {
            for (let addr of interfaces[iface]) {
                if (!addr.internal && addr.family === "IPv6") {
                    output.push(iface);
                    break;
                }
            }
        }
        res.json([...new Set(output)]);
    });
};