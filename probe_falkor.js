const { FalkorDB } = require('falkordb');

console.log("--- FALKORDB API PROBE ---");
console.log("Type of FalkorDB:", typeof FalkorDB);
console.log("Static methods:", Object.getOwnPropertyNames(FalkorDB));
console.log("Prototype methods:", Object.getOwnPropertyNames(FalkorDB.prototype));

try {
  const instance = new FalkorDB();
  console.log("Instance created successfully (no args).");
  console.log("Instance keys:", Object.keys(instance));
} catch (e) {
  console.log("Instance creation failed:", e.message);
}
console.log("--------------------------");
