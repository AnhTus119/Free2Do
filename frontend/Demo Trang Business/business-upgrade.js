document.addEventListener('DOMContentLoaded', async () => {
  try { await BusinessAPI.requireBusiness(); }
  catch (error) { BusinessAPI.notify(error.message, 'error'); }
});
