// Auto-configure API key from environment variable
// This script runs once to set up the API key in localStorage

const apiKey = ''; // Key removed for security. Use .env or UI settings.

if (apiKey) {
    localStorage.setItem('autobotz_api_key', apiKey);
    console.log('✅ API key configured successfully!');
} else {
    console.log('⚠️ No API key found. Please configure in .env or Settings UI.');
}
