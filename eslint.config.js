const expoConfig = require("eslint-config-expo/flat");

module.exports = [
  ...expoConfig,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
    },
  },
];
