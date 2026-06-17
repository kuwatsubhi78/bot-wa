const { handleLemburCommand } = require("./lemburCommand");

function registerCommands() {
  console.log("Commands registered.");
  return {
    handleLemburCommand,
  };
}

module.exports = {
  registerCommands,
};
