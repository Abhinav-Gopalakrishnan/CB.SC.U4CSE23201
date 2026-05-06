const axios = require('axios');

// ─── Configuration ───────────────────────────────────────────────────────────
const BASE_URL = 'http://20.207.122.201/evaluation-service';

const AUTH_CREDENTIALS = {
  email: "abhinavgopalakrishnan06@gmail.com",
  name: "abhinav g",
  rollNo: "cb.sc.u4cse23201",
  accessCode: "PTBMmQ",
  clientID: "b02ebda0-e6f5-4064-a1bf-521238a8f501",
  clientSecret: "BMWaTZZKbAgymKYK"
};

// ─── API Functions ───────────────────────────────────────────────────────────

/**
 * Authenticate with the evaluation service and retrieve a Bearer token.
 */
async function authenticate() {
  try {
    const response = await axios.post(`${BASE_URL}/auth`, AUTH_CREDENTIALS);
    console.log('Authentication successful!\n');
    return response.data.access_token;
  } catch (error) {
    console.error('Authentication failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

/**
 * Fetch all depots from the API.
 * Each depot has an ID and MechanicHours (the daily budget).
 */
async function fetchDepots(token) {
  try {
    const response = await axios.get(`${BASE_URL}/depots`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(`Fetched ${response.data.depots.length} depots.\n`);
    return response.data.depots;
  } catch (error) {
    console.error('Failed to fetch depots:', error.response?.data || error.message);
    process.exit(1);
  }
}

/**
 * Fetch all vehicle maintenance tasks from the API.
 * Each vehicle has a TaskID, Duration (hours), and Impact (importance score).
 */
async function fetchVehicles(token) {
  try {
    const response = await axios.get(`${BASE_URL}/vehicles`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(`Fetched ${response.data.vehicles.length} vehicle tasks.\n`);
    return response.data.vehicles;
  } catch (error) {
    console.error('Failed to fetch vehicles:', error.response?.data || error.message);
    process.exit(1);
  }
}

// ─── 0/1 Knapsack Algorithm ─────────────────────────────────────────────────

/**
 * Solves the 0/1 Knapsack problem using dynamic programming.
 *
 * Given a list of items (each with a Duration and Impact) and a maximum
 * capacity (MechanicHours), find the subset of items that maximises the
 * total Impact without exceeding the capacity.
 *
 * Time Complexity:  O(n * W)  where n = items, W = capacity
 * Space Complexity: O(n * W)  for the keep table (backtracking)
 *
 * @param {Array}  items    - Array of { TaskID, Duration, Impact }
 * @param {number} capacity - Maximum mechanic-hours available
 * @returns {{ maxImpact: number, selectedTasks: Array, totalDuration: number }}
 */
function solveKnapsack(items, capacity) {
  const n = items.length;

  // dp[w] = maximum impact achievable with exactly w capacity
  const dp = new Array(capacity + 1).fill(0);

  // keep[i][w] = true if item i is included in optimal solution at capacity w
  const keep = Array.from({ length: n }, () => new Uint8Array(capacity + 1));

  for (let i = 0; i < n; i++) {
    const weight = items[i].Duration;
    const value  = items[i].Impact;

    // Traverse capacity from right-to-left to avoid using an item more than once
    for (let w = capacity; w >= weight; w--) {
      if (dp[w - weight] + value > dp[w]) {
        dp[w] = dp[w - weight] + value;
        keep[i][w] = 1;
      }
    }
  }

  // ── Backtrack to find which items were selected ──
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

// ─── Display Helpers ─────────────────────────────────────────────────────────

function printSeparator() {
  console.log('═'.repeat(80));
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
 /* console.log('  ┌──────────────────────────────────────────┬──────────┬────────┐');
  console.log('  │ TaskID                                   │ Duration │ Impact │');
  console.log('  ├──────────────────────────────────────────┼──────────┼────────┤');*/

  for (const task of result.selectedTasks) {
    const id   = task.TaskID.padEnd(40);
    const dur  = String(task.Duration).padStart(6);
    const imp  = String(task.Impact).padStart(5);
    console.log(`  │ ${id} │ ${dur}   │ ${imp}  │`);
  }
/*
  console.log('  └──────────────────────────────────────────┴──────────┴────────┘\n');*/
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n Vehicle Maintenance Scheduler — 0/1 Knapsack Optimiser\n');

  // Step 1: Authenticate
  console.log(' Authenticating...');
  const token = await authenticate();

  // Step 2: Fetch data from APIs
  console.log(' Fetching depots...');
  const depots = await fetchDepots(token);

  console.log(' Fetching vehicle tasks...');
  const vehicles = await fetchVehicles(token);

  // Step 3: For each depot, solve the knapsack and display results
  console.log(' Running knapsack optimisation for each depot...\n');

  for (const depot of depots) {
    const result = solveKnapsack(vehicles, depot.MechanicHours);
    printDepotResult(depot, result);
  }

  console.log(' Scheduling complete!\n');
}

main();
