const expoConfig = require("eslint-config-expo/flat");

module.exports = [
  // Agent tooling scripts and build output are not app source.
  { ignores: [".agents/**", "dist/**"] },
  ...expoConfig,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
    },
  },
];
