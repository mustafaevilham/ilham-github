// SMS stub. This is the ONLY function to replace when wiring in a real
// provider (e.g. Eskiz.uz). For now it logs the message to the console so
// the consent link is visible to the operator during development.
function sendSms(phone, message) {
  console.log(`[SMS -> ${phone}] ${message}`);
}

module.exports = { sendSms };
