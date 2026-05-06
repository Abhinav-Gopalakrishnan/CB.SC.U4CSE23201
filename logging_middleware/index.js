const axios = require('axios');


const LOG_API_URL = 'http://20.207.122.201/evaluation-service/logs';
const AUTH_API_URL = 'http://20.207.122.201/evaluation-service/auth';

const AUTH_CREDENTIALS = {
  email: "abhinavgopalakrishnan06@gmail.com",
  name: "abhinav g",
  rollNo: "cb.sc.u4cse23201",
  accessCode: "PTBMmQ",
  clientID: "b02ebda0-e6f5-4064-a1bf-521238a8f501",
  clientSecret: "BMWaTZZKbAgymKYK"
};

const VALID_STACKS = ['backend', 'frontend'];

const VALID_LEVELS = ['debug', 'info', 'warn', 'error', 'fatal'];

const BACKEND_PACKAGES = [
  'cache', 'controller', 'cron_job', 'db', 'domain',
  'handler', 'repository', 'route', 'service'
];

const FRONTEND_PACKAGES = [
  'api', 'component', 'hook', 'page', 'state', 'style'
];

const SHARED_PACKAGES = ['auth', 'config', 'middleware', 'utils'];


let cachedToken = null;
let tokenExpiresAt = 0;

async function getToken() {
  const now = Math.floor(Date.now() / 1000);

  if (cachedToken && now < tokenExpiresAt - 60) {
    return cachedToken;
  }

  try {
    const response = await axios.post(AUTH_API_URL, AUTH_CREDENTIALS);
    cachedToken = response.data.access_token;
    tokenExpiresAt = response.data.expires_in;
    return cachedToken;
  } catch (error) {
    throw new Error(
      'Logging middleware: authentication failed - ' +
      (error.response?.data?.message || error.message)
    );
  }
}

function getValidPackages(stack) {
  if (stack === 'backend') {
    return [...BACKEND_PACKAGES, ...SHARED_PACKAGES];
  }
  if (stack === 'frontend') {
    return [...FRONTEND_PACKAGES, ...SHARED_PACKAGES];
  }
  return [];
}

function validate(stack, level, pkg, message) {
  if (!VALID_STACKS.includes(stack)) {
    throw new Error(
      `Invalid stack "${stack}". Must be one of: ${VALID_STACKS.join(', ')}`
    );
  }

  if (!VALID_LEVELS.includes(level)) {
    throw new Error(
      `Invalid level "${level}". Must be one of: ${VALID_LEVELS.join(', ')}`
    );
  }

  const validPackages = getValidPackages(stack);
  if (!validPackages.includes(pkg)) {
    throw new Error(
      `Invalid package "${pkg}" for stack "${stack}". Must be one of: ${validPackages.join(', ')}`
    );
  }

  if (!message || typeof message !== 'string') {
    throw new Error('Message must be a non-empty string.');
  }

  if (message.length > 48) {
    return message.substring(0, 48);
  }
  return message;
}


/**
 * @param {string} stack   
 * @param {string} level   
 * @param {string} pkg     
 * @param {string} message 
 * @returns {Promise<{logID: string, message: string}>} 
 */
async function Log(stack, level, pkg, message) {
  const sanitizedMessage = validate(stack, level, pkg, message);
  const finalMessage = sanitizedMessage || message;

  const token = await getToken();

  const body = {
    stack: stack,
    level: level,
    package: pkg,
    message: finalMessage
  };

  try {
    const response = await axios.post(LOG_API_URL, body, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const timestamp = new Date().toISOString();
    console.log(
      `[${timestamp}] [${level.toUpperCase()}] [${stack}/${pkg}] ${message} -> logID: ${response.data.logID}`
    );

    return response.data;
  } catch (error) {
    console.error(
      `[LOG FAILED] [${level.toUpperCase()}] [${stack}/${pkg}] ${message} -> ${error.response?.data?.message || error.message}`
    );
    throw error;
  }
}


module.exports = { Log };
