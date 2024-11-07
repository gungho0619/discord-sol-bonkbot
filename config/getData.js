require("dotenv").config();
const axios = require("axios");

// Reusable function for making API requests
async function fetchTokenData(endpoint, address) {
  const url = `https://public-api.dextools.io/trial/v2/token/solana/${address}/${endpoint}`;
  try {
    const res = await axios.get(url, {
      headers: { "x-api-key": process.env.DEX_TOOL_TOKEN },
    });
    return res.data; // Return data if successful
  } catch (err) {
    console.error(`Error fetching ${endpoint} data from Dextools: ${err}`);
    return null; // Return null if there was an error
  }
}

// Specific functions for each data type
async function getTokenInfo(address) {
  return await fetchTokenData("", address);
}

async function getTokenPrice(address) {
  return await fetchTokenData("price", address);
}

async function getTokenInfo2(address) {
  return await fetchTokenData("info", address);
}

module.exports = { getTokenInfo, getTokenPrice, getTokenInfo2 };
