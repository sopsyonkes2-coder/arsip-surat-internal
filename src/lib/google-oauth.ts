import { google } from "googleapis";

export function getOAuthServices() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !redirectUri || !refreshToken) {
    throw new Error("Google OAuth environment variables belum lengkap.");
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  return {
    auth: oauth2Client,
    oauthDrive: google.drive({ version: "v3", auth: oauth2Client }),
    oauthSheets: google.sheets({ version: "v4", auth: oauth2Client }),
  };
}