/**
 * NIA V3 - Service Status Check (FIXED)
 * 
 * Check if NIA service is installed and running.
 * Fixed to handle node-windows adding .exe to service name.
 */

const ServiceManager = require("./service-manager");

console.log("\n=== NIA V3 Service Status ===\n");

const manager = new ServiceManager();

// node-windows adds .exe to the service name and lowercases it
// So "NiaService" becomes "niaservice.exe"
const actualServiceName = "niaservice.exe";

// Use the actual service name for the query
const { exec } = require("child_process");

exec(`sc query ${actualServiceName}`, (error, stdout, stderr) => {
  if (error) {
    console.log("Status: NOT INSTALLED");
    console.log("\nThe service has not been installed yet.");
    console.log("Run 'node install-service.js' to install.\n");
    return;
  }
  
  // Parse output
  const isRunning = stdout.includes("RUNNING");
  const isStopped = stdout.includes("STOPPED");
  
  console.log("Service name: niaservice.exe");
  console.log("Display name: NiaService");
  console.log(`Status: ${isRunning ? "RUNNING ✓" : "STOPPED"}\n`);
  
  if (isRunning) {
    console.log("NIA is currently running in the background.");
    console.log("Check logs in data/logs/ for activity.");
    console.log("\nTo stop: sc stop niaservice.exe");
    console.log("Or use Windows Services manager (services.msc)\n");
  } else {
    console.log("NIA service is installed but not running.");
    console.log("Start it with: sc start niaservice.exe");
    console.log("Or use Windows Services manager (services.msc)\n");
  }
});
