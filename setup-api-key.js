// Auto-configure API key from environment variable
// This script runs once to set up the API key in localStorage

const apiKey = 'AIzaSyDEqCTJ95iQCkACO9nhRR-jev71U6ZM7l8';

if (apiKey) {
    localStorage.setItem('autobotz_api_key', apiKey);
    console.log('✅ API key configured successfully!');
} else {
    console.log('⚠️ No API key found in environment variables');
}
