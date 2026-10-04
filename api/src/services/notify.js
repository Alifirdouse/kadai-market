// Notification stub. Replace the console output with Azure Communication Services
// (Email + SMS) once you have a resource: @azure/communication-email and @azure/communication-sms.
export const notify = {
  async customer(contact, subject, text) {
    console.log(`[notify] to ${contact.email} / ${contact.phone}: ${subject}. ${text}`);
  },
  async sellers(sellerIds, subject, text) {
    console.log(`[notify] to sellers ${sellerIds.join(', ')}: ${subject}. ${text}`);
  },
};
