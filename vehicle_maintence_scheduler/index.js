const axios = require('axios');
const { Log } = require('../logging_middleware');

const BASE_URL = 'http://20.207.122.201/evaluation-service';

const AUTH_CREDENTIALS = {
  email: "abhinavgopalakrishnan06@gmail.com",
  name: "abhinav g",
  rollNo: "cb.sc.u4cse23201",
  accessCode: "PTBMmQ",
  clientID: "b02ebda0-e6f5-4064-a1bf-521238a8f501",
  clientSecret: "BMWaTZZKbAgymKYK"
};


async function authenticate() {
  try {
    const response = await axios.post(`${BASE_URL}/auth`, AUTH_CREDENTIALS);
    await Log('backend', 'info', 'auth', 'Authentication successful, token obtained');
    return response.data.access_token;
  } catch (error) {
    await Log('backend', 'fatal', 'auth', `Authentication failed: ${error.response?.data?.message || error.message}`);
    process.exit(1);
  }
}

async function fetchDepots(token) {
  try {
    const response = await axios.get(`${BASE_URL}/depots`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const depots = response.data.depots;
    await Log('backend', 'info', 'service', `Fetched ${depots.length} depots from evaluation service`);
    return depots;
  } catch (error) {
    await Log('backend', 'error', 'service', `Failed to fetch depots: ${error.response?.data?.message || error.message}`);
    process.exit(1);
  }
}


async function fetchVehicles(token) {
  try {
    const response = await axios.get(`${BASE_URL}/vehicles`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const vehicles = response.data.vehicles;
    await Log('backend', 'info', 'service', `Fetched ${vehicles.length} vehicle tasks from evaluation service`);
    return vehicles;
  } catch (error) {
    await Log('backend', 'error', 'service', `Failed to fetch vehicles: ${error.response?.data?.message || error.message}`);
    process.exit(1);
  }
}


/**
 * @param {Array}  items    
 * @param {number} capacity 
 * @returns {{ maxImpact: number, selectedTasks: Array, totalDuration: number }}
 */
function solveKnapsack(items, capacity) {
  const n = items.length;

  const dp = new Array(capacity + 1).fill(0);

  const keep = Array.from({ length: n }, () => new Uint8Array(capacity + 1));

  for (let i = 0; i < n; i++) {
    const weight = items[i].Duration;
    const value  = items[i].Impact;

    for (let w = capacity; w >= weight; w--) {
      if (dp[w - weight] + value > dp[w]) {
        dp[w] = dp[w - weight] + value;
        keep[i][w] = 1;
      }
    }
  }

  const selectedTasks = [];
  let remainingCapacity = capacity;

  for (let i = n - 1; i >= 0; i--) {
    if (keep[i][remainingCapacity]) {
      selectedTasks.push(items[i]);
      remainingCapacity -= items[i].Duration;
    }
  }

  return {
    maxImpact: dp[capacity],
    selectedTasks,
    totalDuration: capacity - remainingCapacity
  };
}


function printSeparator() {
  console.log('='.repeat(80));
}

function printDepotResult(depot, result) {
  printSeparator();
  console.log(`  DEPOT ${depot.ID}`);
  console.log(`  Mechanic-Hour Budget : ${depot.MechanicHours} hrs`);
  console.log(`  Tasks Selected       : ${result.selectedTasks.length}`);
  console.log(`  Total Duration Used  : ${result.totalDuration} / ${depot.MechanicHours} hrs`);
  console.log(`  Max Operational Impact: ${result.maxImpact}`);
  printSeparator();

  console.log('\n  Selected Tasks:');
 
  for (const task of result.selectedTasks) {
    const id   = task.TaskID.padEnd(40);
    const dur  = String(task.Duration).padStart(6);
    const imp  = String(task.Impact).padStart(5);
    console.log(`  | ${id} | ${dur}   | ${imp}  |`);
  }

 }


async function main() {
  console.log('\n--- Vehicle Maintenance Scheduler ---\n');

  console.log('[*] Authenticating...');
  const token = await authenticate();

  console.log('[*] Fetching depots...');
  const depots = await fetchDepots(token);

  console.log('[*] Fetching vehicle tasks...');
  const vehicles = await fetchVehicles(token);

  await Log('backend', 'info', 'service', `Starting knapsack optimisation for ${depots.length} depots with ${vehicles.length} tasks`);
  console.log('[*] Running knapsack optimisation for each depot...\n');

  for (const depot of depots) {
    const result = solveKnapsack(vehicles, depot.MechanicHours);
    printDepotResult(depot, result);

    await Log(
      'backend', 'info', 'service',
      `Depot ${depot.ID}: selected ${result.selectedTasks.length} tasks, ` +
      `used ${result.totalDuration}/${depot.MechanicHours} hrs, ` +
      `max impact = ${result.maxImpact}`
    );
  }

  await Log('backend', 'info', 'service', 'Vehicle maintenance scheduling completed successfully');
  console.log('[*] Scheduling complete!\n');
}

main();
