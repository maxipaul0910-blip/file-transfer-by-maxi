/**
 * Auth0 Post Login Action for the FloFileTransfer roles API.
 * Publish this Action and add it to the Login flow after creating the API
 * whose identifier is https://flofiletransfer-roles.maxi-paul0910-d91.workers.dev.
 */
exports.onExecutePostLogin = async (event, api) => {
  const namespace = "https://flofiletransfer.app";
  if (!event.user.email) return;

  api.accessToken.setCustomClaim(`${namespace}/email`, event.user.email);
  api.accessToken.setCustomClaim(`${namespace}/email_verified`, event.user.email_verified === true);
  api.accessToken.setCustomClaim(`${namespace}/name`, event.user.name || event.user.nickname || "");
};
