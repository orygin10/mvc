import {
  CognitoIdentityCredentialProvider,
  fromCognitoIdentityPool,
} from "@aws-sdk/credential-providers";
import { S3 } from "./s3";
import { S3Client } from "@aws-sdk/client-s3";
import { FileManager, FileManagerOptions } from "./fileManager";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { Dynamo } from "./dynamo";

interface AWSServiceProperties {
  region: string;
  clientId: string;
  identityPoolId: string;
  userPoolId: string;
  domain: string;
  redirectUri: string;
  logoutUri: string;
}

interface SessionParams {
  id_token: string;
  access_token: string;
  refresh_token?: string;
  token_expiry: string;
}

interface LoginOptions {
  // call the cognito identity credentials provider if we think we are logged in
  check?: boolean;
  // redirect to login if we are not logged in
  redirect?: boolean;
  // throw error if we are not logged in
  throw?: boolean;
}

export class AWSService {
  private _cognitoIdentityCredentials?: Awaited<
    ReturnType<CognitoIdentityCredentialProvider>
  >;
  private cognitoIdentityCredentialsIdToken?: string;
  private tokenUrl;
  constructor(private properties: AWSServiceProperties) {
    this.tokenUrl = `https://${this.properties.domain}/oauth2/token`;
  }

  /**
   *
   * @returns true if logged in, false otherwise
   * @throws If the login fails, or if not logged in and options.throw is true
   */
  async login(options?: LoginOptions) {
    return await this.checkForCodeOrSession().then(async (loggedIn) => {
      if (loggedIn && options?.check) {
        const identity = await this.cognitoIdentityCredentials({ force: true });
        console.log("[LIBPPM] Login check: Get Cognito Identity", identity);
        return true;
      }

      if (!loggedIn && options?.redirect) {
        this.redirectToLogin();
        return false;
      }

      if (!loggedIn && options?.throw) {
        throw new Error("Not logged in");
      }
      return loggedIn;
    });
  }

  private async checkForCodeOrSession() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");

    if (code) {
      await this.exchangeCodeForToken(code);
      window.history.replaceState({}, document.title, "/");
      return true;
    } else {
      const expiry = sessionStorage.getItem("token_expiry");
      if (!expiry) {
        this.cleanup();
        return false;
      }
      if (Date.now() > +expiry) {
        await this.refreshToken();
      }
      return true;
    }
  }

  /**
   * Exchanges the authorization code for tokens.
   * @throws {Error} Error if token exchange fails
   * @returns if successful
   */
  private async exchangeCodeForToken(code: string) {
    const { clientId, redirectUri } = this.properties;
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      redirect_uri: redirectUri,
      code: code,
    });

    try {
      const response = await fetch(this.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      });

      const data = await response.json();
      if (data.id_token) {
        this.storeTokens(data);
      } else {
        console.error("Token exchange failed:", data);
        throw new Error("Token exchange failed");
      }
    } catch (error) {
      console.error("Error exchanging code for token:", error);
      throw new Error("Error exchanging code for token");
    }
  }

  /**
   * Refreshes the access token using the refresh token.
   * @throws If no refresh token is found in session storage.
   * @throws If token refresh fails.
   * @returns if successful
   */
  private async refreshToken() {
    const { clientId } = this.properties;
    const refreshToken = sessionStorage.getItem("refresh_token");
    if (!refreshToken) {
      throw new Error("No refresh token found in session storage");
    }

    const params = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: refreshToken,
    });

    try {
      const response = await fetch(this.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      });

      const data = await response.json();
      if (data.id_token) {
        this.storeTokens(data);
      } else {
        if (data.error && data.error === "invalid_grant") {
          sessionStorage.clear();
          alert("You have been logged out, log in again");
        }
        console.error("Token refresh failed:", data);
        throw new Error("Token refresh failed");
      }
    } catch (error) {
      console.error("Error refreshing token:", error);
      throw new Error("Error refreshing token");
    }
  }

  private async cognitoIdentityCredentials(opts?: { force?: boolean }) {
    const idToken = sessionStorage.getItem("id_token");
    if (!idToken) {
      throw new Error("No id token found in session storage");
    }

    if (opts?.force || this.cognitoIdentityCredentialsIdToken !== idToken) {
      this._cognitoIdentityCredentials = undefined;
      this.cognitoIdentityCredentialsIdToken = idToken;
    }

    if (!this._cognitoIdentityCredentials) {
      const { region, userPoolId, identityPoolId } = this.properties;
      const credentials = await getAWSCredentials(idToken, {
        region,
        userPoolId,
        identityPoolId,
      })();
      this._cognitoIdentityCredentials = credentials;
    }
    return this._cognitoIdentityCredentials;
  }

  private async s3() {
    const credentials = await this.cognitoIdentityCredentials();
    const { identityId } = credentials;
    const client = new S3Client({
      credentials,
      region: this.properties.region,
    });
    return new S3(client, identityId);
  }

  async dynamo({ tableName }: { tableName: string }) {
    const credentials = await this.cognitoIdentityCredentials();
    const { identityId } = credentials;
    const client = new DynamoDBClient({
      credentials,
      region: this.properties.region,
    });
    const userInfo = this.userInfo();
    return new Dynamo(client, tableName, {
      CognitoIdentityId: identityId,
    },
    {
      user: userInfo["cognito:username"],
      sub: userInfo["sub"],
    });
  }

  files({ bucket }: Pick<FileManagerOptions, "bucket">) {
    return new FileManager({ bucket, s3: () => this.s3() });
  }

  /**
   * Redirects to the AWS Cognito login experience
   */
  redirectToLogin() {
    const { domain, redirectUri, clientId } = this.properties;
    const authUrl = `https://${domain}/oauth2/authorize?client_id=${clientId}&response_type=code&scope=openid+email+profile&redirect_uri=${redirectUri}`;
    window.location.href = authUrl;
  }

  private cleanup() {
    sessionStorage.clear();
  }

  logout() {
    this.cleanup();
    const { domain, logoutUri, clientId } = this.properties;
    window.location.href = `https://${domain}/logout?client_id=${clientId}&logout_uri=${logoutUri}`;
  }

  userInfo() {
    const idToken = sessionStorage.getItem("id_token");
    if (!idToken) {
      throw new Error("No id token found in session storage");
    }
    return parseToken(idToken);
  }

  private storeTokens(data: SessionParams) {
    sessionStorage.setItem("id_token", data.id_token);
    sessionStorage.setItem("access_token", data.access_token);
    data.refresh_token &&
      sessionStorage.setItem("refresh_token", data.refresh_token);
    sessionStorage.setItem("token_expiry", `${Date.now() + 3600000}`); // 1 hour
  }
}

interface UserInfo {
  "cognito:username": string;
  exp: number;
  sub: string;
  [key: string]: any;
}

function parseToken(idToken: string): UserInfo {
  return JSON.parse(atob(idToken.split(".")[1]));
}

interface GetAWSCredentialsParams {
  region: string;
  identityPoolId: string;
  userPoolId: string;
}

function getAWSCredentials(
  idToken: string,
  { region, userPoolId, identityPoolId }: GetAWSCredentialsParams,
) {
  return fromCognitoIdentityPool({
    clientConfig: { region },
    identityPoolId,
    logins: {
      [`cognito-idp.${region}.amazonaws.com/${userPoolId}`]: idToken,
    },
  });
}
