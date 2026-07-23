const { withEntitlementsPlist } = require('expo/config-plugins');

/** Drop push entitlement until Push Notifications is enabled on the App ID. */
module.exports = (config) =>
  withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults['aps-environment'];
    return cfg;
  });
