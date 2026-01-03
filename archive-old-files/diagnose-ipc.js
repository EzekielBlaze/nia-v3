/**
 * Diagnostic: Check what node-ipc actually exports
 */

console.log("\n=== node-ipc Diagnostic ===\n");

try {
  const nodeIPC = require("node-ipc");
  
  console.log("Module loaded successfully!");
  console.log("\nType:", typeof nodeIPC);
  console.log("\nKeys:", Object.keys(nodeIPC));
  console.log("\nFull structure:");
  console.log(JSON.stringify(nodeIPC, null, 2));
  
  console.log("\n=== Checking .IPC ===");
  if (nodeIPC.IPC) {
    console.log("nodeIPC.IPC exists!");
    console.log("Type:", typeof nodeIPC.IPC);
  } else {
    console.log("nodeIPC.IPC does NOT exist");
  }
  
  console.log("\n=== Checking .default ===");
  if (nodeIPC.default) {
    console.log("nodeIPC.default exists!");
    console.log("Type:", typeof nodeIPC.default);
  } else {
    console.log("nodeIPC.default does NOT exist");
  }
  
} catch (err) {
  console.error("Error:", err.message);
}

console.log("\n");
