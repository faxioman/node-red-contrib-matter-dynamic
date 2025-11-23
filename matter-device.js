const { Endpoint } = require("@matter/main");
const matterBehaviors = require("@matter/main/behaviors");

// ============================================================================
// BEHAVIOR PATCHING
// ============================================================================

/**
 * Patches all Matter behaviors to handle unimplemented commands gracefully.
 * This allows Node-RED to receive and process commands even if not implemented in Matter.js
 */
function patchBehaviors() {
    Object.values(matterBehaviors).forEach(BehaviorClass => {
        if (!BehaviorClass?.cluster?.commands || typeof BehaviorClass !== 'function') return;
        
        Object.entries(BehaviorClass.cluster.commands).forEach(([cmd, def]) => {
            const originalMethod = BehaviorClass.prototype[cmd];
            
            BehaviorClass.prototype[cmd] = async function(request) {
                // Send command to Node-RED second output
                if (this.endpoint?.nodeRed) {
                    const payload = {
                        command: cmd,
                        cluster: BehaviorClass.cluster.name,
                        data: request
                    };
                    
                    this.endpoint.nodeRed.send([null, { payload }]);
                    
                    // Auto-confirm command if enabled
                    if (this.endpoint.nodeRed.autoConfirm) {
                        // Build confirmation state based on command
                        const confirmState = this.endpoint.nodeRed.buildAutoConfirmState(cmd, BehaviorClass.cluster.name, request);
                        if (confirmState) {
                            // Schedule confirmation after a short delay to allow command to be processed
                            setTimeout(() => {
                                if (this.endpoint?.nodeRed) {
                                    this.endpoint.nodeRed.log(`Auto-confirming command: ${cmd}`);
                                    this.endpoint.set(confirmState).catch(err => {
                                        this.endpoint.nodeRed.error(`Failed to auto-confirm: ${err.message}`);
                                    });
                                }
                            }, 50);
                        }
                    }
                }
                
                // Execute original method if exists and is implemented
                if (originalMethod && !originalMethod.toString().includes('unimplemented')) {
                    return await originalMethod.call(this, request);
                }
                
                // Return default response if needed
                if (!def.responseSchema || def.responseSchema.name === 'TlvNoResponse') return;
                return { status: 0 };
            };
        });
    });
}

// Apply patches before loading devices
patchBehaviors();

// Load Matter devices after patching
const matterDevices = require("@matter/main/devices");
const { BridgedDeviceBasicInformationServer, IdentifyServer } = matterBehaviors;

// ============================================================================
// CUSTOM BEHAVIORS
// ============================================================================

class DynamicIdentifyServer extends IdentifyServer {
    async triggerEffect(identifier, variant) {
        console.log(`triggerEffect received identifier:${identifier}, variant: ${variant}`);
    }
}

// ============================================================================
// DEVICE FACTORY
// ============================================================================

class DeviceFactory {
    /**
     * Creates behaviors array with optional features
     */
    static createBehaviorsWithFeatures(behaviors, behaviorFeatures = {}) {
        return behaviors.map(behavior => {
            if (typeof behavior === 'string') {
                const BehaviorClass = matterBehaviors[behavior];
                if (!BehaviorClass) return null;
                
                const clusterName = behavior.replace('Server', '');
                if (behaviorFeatures[clusterName]) {
                    const clusters = require("@matter/main/clusters");
                    const cluster = clusters[clusterName];
                    const features = behaviorFeatures[clusterName]
                        .map(fname => cluster?.Feature?.[fname])
                        .filter(f => f);
                    
                    if (features.length > 0) {
                        return BehaviorClass.with(...features);
                    }
                }
                return BehaviorClass;
            }
            return behavior;
        }).filter(b => b);
    }

    /**
     * Creates a Matter device based on JSON configuration
     */
    static createDevice(node, deviceConfig) {
        // Handle composite devices (array of device types)
        if (Array.isArray(deviceConfig.deviceType)) {
            return this.createEnhancedDevice(node, deviceConfig);
        }
        
        // Standard single device type
        return this.createStandardDevice(node, deviceConfig);
    }
    
    /**
     * Creates a standard Matter device with optional additional behaviors
     */
    static createStandardDevice(node, deviceConfig) {
        const DeviceClass = matterDevices[deviceConfig.deviceType];
        if (!DeviceClass) {
            throw new Error(`Device type '${deviceConfig.deviceType}' not found`);
        }

        // Collect mandatory behaviors from device requirements
        const behaviors = this.getMandatoryBehaviors(DeviceClass, deviceConfig.behaviorFeatures);
        
        // Add base behaviors
        behaviors.push(BridgedDeviceBasicInformationServer, DynamicIdentifyServer);
        
        // Add additional behaviors if specified
        if (deviceConfig.additionalBehaviors) {
            const additionalBehaviors = this.createBehaviorsWithFeatures(
                deviceConfig.additionalBehaviors,
                deviceConfig.behaviorFeatures
            );
            behaviors.push(...additionalBehaviors);
        }
        
        // Create and return endpoint
        return this.createEndpoint(node, DeviceClass, behaviors, deviceConfig);
    }
    
    /**
     * Creates an enhanced device with additional behaviors (e.g., thermostat with battery)
     */
    static createEnhancedDevice(node, deviceConfig) {
        // Matter endpoints can only have ONE primary device type
        if (!Array.isArray(deviceConfig.deviceType) || deviceConfig.deviceType.length === 0) {
            throw new Error("deviceType must be an array with at least one device type");
        }
        
        const primaryDeviceTypeName = deviceConfig.deviceType[0];
        const DeviceClass = matterDevices[primaryDeviceTypeName];
        if (!DeviceClass) {
            throw new Error(`Device type '${primaryDeviceTypeName}' not found`);
        }
        
        // Collect mandatory behaviors from primary device
        const behaviors = this.getMandatoryBehaviors(DeviceClass, deviceConfig.behaviorFeatures);
        
        // Add base behaviors
        behaviors.push(BridgedDeviceBasicInformationServer, DynamicIdentifyServer);
        
        // Add additional behaviors if specified
        if (deviceConfig.additionalBehaviors) {
            const additionalBehaviors = this.createBehaviorsWithFeatures(
                deviceConfig.additionalBehaviors,
                deviceConfig.behaviorFeatures
            );
            behaviors.push(...additionalBehaviors);
        }
        
        // Create and return endpoint
        return this.createEndpoint(node, DeviceClass, behaviors, deviceConfig);
    }
    
    /**
     * Gets mandatory behaviors from device class requirements
     */
    static getMandatoryBehaviors(DeviceClass, behaviorFeatures = {}) {
        const behaviors = [];
        
        if (DeviceClass.requirements?.server?.mandatory) {
            Object.entries(DeviceClass.requirements.server.mandatory).forEach(([key, BehaviorClass]) => {
                if (!BehaviorClass) return;
                
                const behaviorName = key.replace('Server', '');
                if (behaviorFeatures[behaviorName]) {
                    const clusters = require("@matter/main/clusters");
                    const cluster = clusters[behaviorName];
                    const features = behaviorFeatures[behaviorName]
                        .map(fname => cluster?.Feature?.[fname])
                        .filter(f => f);
                    
                    if (features.length > 0) {
                        behaviors.push(BehaviorClass.with(...features));
                    } else {
                        behaviors.push(BehaviorClass);
                    }
                } else {
                    behaviors.push(BehaviorClass);
                }
            });
        }
        
        return behaviors;
    }
    
    /**
     * Creates Matter endpoint with configuration
     */
    static createEndpoint(node, DeviceClass, behaviors, deviceConfig) {
        const endpointConfig = {
            id: node.id.replace(/-/g, ''),
            bridgedDeviceBasicInformation: {
                nodeLabel: node.name,
                productName: node.name,
                productLabel: node.name,
                serialNumber: node.id.replace(/-/g, ''),
                uniqueId: node.id.replace(/-/g, '').split("").reverse().join(""),
                reachable: true,
            }
        };
        
        // Add initial state if provided
        if (deviceConfig.initialState) {
            Object.assign(endpointConfig, deviceConfig.initialState);
        }
        
        // Create endpoint
        const endpoint = new Endpoint(
            DeviceClass.with(...behaviors),
            endpointConfig
        );
        
        // Pass node reference for command handling
        endpoint.nodeRed = node;
        
        return endpoint;
    }
}

// ============================================================================
// EVENT MANAGER
// ============================================================================

class EventManager {
    constructor(node) {
        this.node = node;
        this.eventHandlers = {};
        this.identifyStartHandler = null;
        this.identifyStopHandler = null;
        this.eventsSubscribed = false;
    }
    
    /**
     * Subscribe to all device events
     */
    subscribe() {
        if (this.eventsSubscribed) {
            this.node.log("Events already subscribed, skipping");
            return;
        }
        
        if (!this.node.device?.events) {
            this.node.error("Device or device.events not available");
            return;
        }
        
        // Test device initialization
        try {
            const testAccess = this.node.device.state;
        } catch (err) {
            this.handleInitError(err);
            return;
        }
        
        this.eventsSubscribed = true;
        
        try {
            Object.keys(this.node.device.events).forEach(clusterName => {
                if (clusterName === 'identify') {
                    this.subscribeIdentifyEvents();
                    return;
                }
                
                this.subscribeClusterEvents(clusterName);
            });
        } catch (err) {
            this.handleInitError(err);
        }
    }
    
    /**
     * Subscribe to identify events
     */
    subscribeIdentifyEvents() {
        this.identifyStartHandler = () => {
            this.node.status({fill:"blue", shape:"dot", text:"identify"});
        };
        this.identifyStopHandler = () => {
            this.node.status({fill:"green", shape:"dot", text:"ready"});
        };
        
        const events = this.node.device.events.identify;
        if (events.startIdentifying) {
            events.startIdentifying.on(this.identifyStartHandler);
        }
        if (events.stopIdentifying) {
            events.stopIdentifying.on(this.identifyStopHandler);
        }
    }
    
    /**
     * Subscribe to cluster state change events
     */
    subscribeClusterEvents(clusterName) {
        const clusterEvents = this.node.device.events[clusterName];
        if (!clusterEvents || !this.node.device.state?.[clusterName]) return;
        
        Object.keys(this.node.device.state[clusterName]).forEach(attributeName => {
            const eventName = `${attributeName}$Changed`;
            if (!clusterEvents[eventName]) return;
            
            try {
                const handlerKey = `${clusterName}.${eventName}`;
                this.eventHandlers[handlerKey] = this.createEventHandler(clusterName, attributeName);
                clusterEvents[eventName].on(this.eventHandlers[handlerKey]);
            } catch (err) {
                this.node.error(`Failed to subscribe to ${clusterName}.${eventName}: ${err.message}`);
            }
        });
    }
    
    /**
     * Creates event handler for attribute changes
     */
    createEventHandler(clusterName, attributeName) {
        return (value, oldValue, context) => {
            const msg = {
                payload: {
                    [clusterName]: {
                        [attributeName]: value
                    }
                }
            };
            
            if (context) {
                msg.eventSource = {
                    local: context.offline || false
                };
                if (context.exchange?.channel?.channel) {
                    msg.eventSource.srcAddress = context.exchange.channel.channel.peerAddress;
                    msg.eventSource.srcPort = context.exchange.channel.channel.peerPort;
                }
            }
            
            // Send event to first output
            this.node.send([msg, null]);
        };
    }
    
    /**
     * Handle initialization error
     */
    handleInitError(err) {
        this.node.error(`Device not properly initialized: ${err.message}`);
        this.node.status({fill:"red", shape:"ring", text:"init failed"});
        this.node.deviceInitFailed = true;
    }
    
    /**
     * Cleanup all event subscriptions
     */
    async cleanup() {
        if (!this.node.device?.events) return;
        
        // Remove cluster event handlers
        for (const [handlerKey, handler] of Object.entries(this.eventHandlers)) {
            const [clusterName, eventName] = handlerKey.split('.');
            if (this.node.device.events[clusterName]?.[eventName]) {
                await this.node.device.events[clusterName][eventName].off(handler);
            }
        }
        
        // Remove identify event handlers
        if (this.node.device.events.identify) {
            if (this.identifyStartHandler && this.node.device.events.identify.startIdentifying) {
                await this.node.device.events.identify.startIdentifying.off(this.identifyStartHandler);
            }
            if (this.identifyStopHandler && this.node.device.events.identify.stopIdentifying) {
                await this.node.device.events.identify.stopIdentifying.off(this.identifyStopHandler);
            }
        }
    }
}

// ============================================================================
// MAIN NODE DEFINITION
// ============================================================================

module.exports = function(RED) {
    function MatterDevice(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        
        // Basic configuration
        node.bridge = RED.nodes.getNode(config.bridge);
        node.name = config.name;
        node.type = 'matter-device';
        node.autoConfirm = /^true$/i.test(config.autoConfirm);
        node.deviceInitFailed = false;
        
        // Device initialization promise
        node.initPromise = new Promise((resolve, reject) => {
            node.resolveInit = resolve;
            node.rejectInit = (error) => {
                // Don't reject if already resolved or during normal cleanup
                try {
                    reject(error);
                } catch (e) {
                    // Promise already settled, ignore
                }
            };
        });
        
        // Parse device configuration
        let deviceConfig;
        try {
            deviceConfig = typeof config.deviceConfig === 'string'
                ? JSON.parse(config.deviceConfig)
                : config.deviceConfig;
        } catch (e) {
            node.error("Invalid device configuration JSON: " + e.message);
            return;
        }
        
        this.log(`Loading Dynamic Device: ${deviceConfig.deviceType}`);
        node.status({fill:"red", shape:"ring", text:"not running"});
        
        // Initialize event manager
        const eventManager = new EventManager(node);
        
        // Build auto-confirm state based on command
        node.buildAutoConfirmState = function(cmd, clusterName, request) {
            const state = {};
            
            // Handle OnOff commands
            if (clusterName === 'OnOff') {
                if (cmd === 'on') {
                    state.onOff = { onOff: true };
                } else if (cmd === 'off') {
                    state.onOff = { onOff: false };
                } else if (cmd === 'toggle' && node.device?.state?.onOff) {
                    state.onOff = { onOff: !node.device.state.onOff.onOff };
                }
            }
            
            return Object.keys(state).length > 0 ? state : null;
        };
        
        // ====================================================================
        // INPUT MESSAGE HANDLER
        // ====================================================================
        
        this.on('input', async function(msg) {
            try {
                // Wait for device initialization
                await node.initPromise;
                
                // Handle state query
                if (msg.topic === 'state') {
                    msg.payload = {};
                    Object.keys(node.device.state).forEach(cluster => {
                        msg.payload[cluster] = {...node.device.state[cluster]};
                    });
                    node.send(msg);
                    return;
                }
                
                // Handle attribute updates
                if (msg.payload && typeof msg.payload === 'object') {
                    try {
                        await node.device.set(msg.payload);
                    } catch (err) {
                        node.error(`Failed to update: ${err.message}`);
                    }
                }
            } catch (err) {
                node.error(`Device initialization failed: ${err.message}`);
            }
        });
        
        // ====================================================================
        // DEVICE INITIALIZATION
        // ====================================================================
        
        this.on('serverReady', function() {
            if (!node.device) {
                node.error("Device not available on serverReady");
                return;
            }
            
            if (node.deviceAddedSuccessfully === false || node.deviceInitFailed) {
                node.log("Device initialization failed, skipping event subscription");
                return;
            }
            
            node.log(`Device state available: ${!!node.device.state}`);
            node.log(`Device events available: ${!!node.device.events}`);
            
            // Check device initialization after a delay
            setTimeout(async () => {
                if (node.deviceInitFailed) return;
                
                try {
                    if (!node.device?.state || !node.device?.events) {
                        throw new Error("Device structure incomplete");
                    }
                    
                    // Test access
                    const testAccess = Object.keys(node.device.state);
                    
                    // Subscribe to events
                    eventManager.subscribe();
                    
                    // Set ready status if successful
                    if (!node.deviceInitFailed) {
                        node.status({fill:"green", shape:"dot", text:"ready"});
                        node.resolveInit();
                    }
                } catch (err) {
                    node.error(`Device not properly initialized: ${err.message}`);
                    node.status({fill:"red", shape:"ring", text:"init failed"});
                    node.deviceInitFailed = true;
                }
            }, 2000);
        });
        
        this.on('deviceInitFailed', function(errorMsg) {
            node.error(`Device validation failed: ${errorMsg}`);
            node.deviceInitFailed = true;
            node.status({fill:"red", shape:"ring", text:"validation error"});
            node.rejectInit(new Error(errorMsg));
            if (node.statusTimer) {
                clearTimeout(node.statusTimer);
            }
        });
        
        // ====================================================================
        // CLEANUP
        // ====================================================================
        
        this.on('close', async function(removed, done) {
            const rtype = removed ? 'Device was removed/disabled' : 'Device was restarted';
            node.log(`Closing device: ${this.id}, ${rtype}`);
            
            // Cleanup event subscriptions
            await eventManager.cleanup();
            
            // Remove Node-RED Custom Events
            node.removeAllListeners('serverReady');
            node.removeAllListeners('deviceInitFailed');
            
            // Remove from bridge
            if (node.bridge?.registered) {
                const index = node.bridge.registered.indexOf(node);
                if (index > -1) {
                    node.bridge.registered.splice(index, 1);
                }
            }
            
            // Close device if removed
            if (removed && node.device) {
                await node.device.close();
            }
            
            done();
        });
        
        // ====================================================================
        // BRIDGE REGISTRATION
        // ====================================================================
        
        function waitForBridge(node) {
            if (!node.bridge) {
                node.error("Bridge not found");
                node.status({fill:"red", shape:"ring", text:"no bridge"});
                return;
            }
            
            if (!node.bridge.serverReady) {
                setTimeout(waitForBridge, 100, node);
            } else {
                try {
                    node.device = DeviceFactory.createDevice(node, deviceConfig);
                    
                    if (typeof node.bridge.registerChild === 'function') {
                        node.bridge.registerChild(node);
                    } else {
                        node.error("Bridge registerChild function not found");
                    }
                } catch (e) {
                    node.error("Failed to create device: " + e.message);
                    node.status({fill:"red", shape:"ring", text:"error"});
                }
            }
        }
        
        // Start registration process
        if (node.bridge) {
            waitForBridge(node);
        } else {
            node.error("Bridge configuration not found");
            node.status({fill:"red", shape:"ring", text:"no bridge"});
        }
    }
    
    RED.nodes.registerType("matter-device", MatterDevice);
};
