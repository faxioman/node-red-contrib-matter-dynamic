// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get Matter-compatible device ID from Node-RED node ID
 * Removes hyphens from the node ID to create a valid Matter device identifier
 *
 * @param {string} nodeId - Node-RED node ID (e.g., "a1b2-c3d4-e5f6")
 * @returns {string} Matter device ID (e.g., "a1b2c3d4e5f6")
 */
function getMatterDeviceId(nodeId) {
    return nodeId.replace(/-/g, '');
}

/**
 * Get Matter-compatible unique ID from Node-RED node ID
 * Creates a reversed version of the device ID for uniqueness
 *
 * @param {string} nodeId - Node-RED node ID (e.g., "a1b2-c3d4-e5f6")
 * @returns {string} Matter unique ID (reversed device ID, e.g., "6f5e4d3c2b1a")
 */
function getMatterUniqueId(nodeId) {
    return getMatterDeviceId(nodeId).split("").reverse().join("");
}

module.exports = {
    getMatterDeviceId,
    getMatterUniqueId
};