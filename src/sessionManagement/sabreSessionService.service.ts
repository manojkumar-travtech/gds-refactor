import axios, { AxiosInstance } from "axios";
import { Parser } from "xml2js";
import { ConfigManager } from "../config/config.manager";
import { loginEnevelope } from "../connectors/Envelopes/loginEnvelope";
import { LogoutEnvelope } from "../connectors/Envelopes/logoutEnvelope";
import {
  buildSoapEnvelope,
  BuildSoapEnvelopeInterface,
} from "../connectors/Envelopes/buildSoapEnvelope";
import logger from "../utils/logger";

interface SabreSessionToken {
  _: string;
  $?: {
    valueType?: string;
    EncodingType?: string;
  };
}

export class SabreSessionService {
  private static instance: SabreSessionService;

  private httpClient: AxiosInstance;
  private parser: Parser;
  private config = ConfigManager.getInstance();

  private sessionToken?: SabreSessionToken;
  private tokenExpiry?: Date;
  private isAuthenticated = false;
  private conversationId?: string;

  /** mutex */
  private loginPromise?: Promise<void>;

  private constructor() {
    const sabre = this.config.sabre;

    this.httpClient = axios.create({
      baseURL: sabre.endpoint,
      timeout: 30000,
      headers: {
        "Content-Type": "text/xml;charset=UTF-8",
      },
    });

    this.parser = new Parser({
      explicitArray: false,
      ignoreAttrs: false,
    });

    this.registerShutdownHooks();
  }

  /* =======================
     Singleton
  ======================= */
  static getInstance(): SabreSessionService {
    if (!this.instance) {
      this.instance = new SabreSessionService();
    }
    return this.instance;
  }

  /* =======================
     Login (mutex protected)
  ======================= */
  async login(): Promise<void> {
    if (this.loginPromise) {
      return this.loginPromise;
    }

    this.loginPromise = this.performLogin().finally(() => {
      this.loginPromise = undefined;
    });

    return this.loginPromise;
  }

  private async performLogin(): Promise<void> {
    const sabre = this.config.sabre;

    logger.info("🔐 Authenticating with Sabre...");
    logger.info(`Using PCC: ${sabre.pcc}`);

    const soapEnvelope = loginEnevelope(sabre);
    const response = await this.httpClient.post("", soapEnvelope);

    const parsed = await this.parser.parseStringPromise(response.data);
    const envelope = parsed?.["soap-env:Envelope"] || parsed?.Envelope;

    if (!envelope) {
      throw new Error("Invalid SOAP response: Envelope not found");
    }

    const header = envelope["soap-env:Header"] || envelope.Header;
    const security = header?.["wsse:Security"] || header?.Security;

    const token =
      security?.["wsse:BinarySecurityToken"] ??
      security?.BinarySecurityToken;

    if (!token?._) {
      throw new Error("BinarySecurityToken missing in Sabre response");
    }

    const body = envelope["soap-env:Body"] || envelope.Body;
    const sessionRS = body?.SessionCreateRS;

    this.conversationId =
      sessionRS?.ConversationId ??
      header?.["eb:MessageHeader"]?.ConversationId;

    this.sessionToken = token;
    this.isAuthenticated = true;

    // Sabre session ~20 minutes
    this.tokenExpiry = new Date(Date.now() + 20 * 60 * 1000);

    logger.info(
      `✅ Sabre session established (expires ${this.tokenExpiry.toISOString()})`,
    );
  }

  /* =======================
     Ensure valid session
  ======================= */
  async ensureSession(): Promise<void> {
    if (
      this.isAuthenticated &&
      this.sessionToken &&
      this.tokenExpiry &&
      this.tokenExpiry.getTime() > Date.now() + 60_000
    ) {
      return;
    }

    await this.login();
  }

  /* =======================
     Access token
  ======================= */
  async getAccessToken(): Promise<string> {
    await this.ensureSession();

    if (!this.sessionToken?._) {
      throw new Error("Sabre session token unavailable");
    }

    return this.sessionToken._;
  }

  async getConversationId(): Promise<string | undefined> {
    return this.conversationId;
  }

  /* =======================
     Logout
  ======================= */
  async logout(): Promise<void> {
    if (!this.isAuthenticated || !this.sessionToken) return;

    const sabre = this.config.sabre;

    const body = LogoutEnvelope(sabre.pcc);
    const soapEnvelopeRequest: BuildSoapEnvelopeInterface = {
      action: "SessionCloseRQ",
      service: "SessionCloseRQ",
      body,
      organization: sabre.organization,
      sessionToken: this.sessionToken._,
    };

    const soapEnvelope = buildSoapEnvelope(soapEnvelopeRequest);

    try {
      await this.httpClient.post("", soapEnvelope);
      logger.info("👋 Sabre session closed");
    } catch (err) {
      logger.warn("Sabre logout failed", err);
    } finally {
      this.isAuthenticated = false;
      this.sessionToken = undefined;
      this.tokenExpiry = undefined;
      this.conversationId = undefined;
    }
  }

  /* =======================
     Shutdown hooks
  ======================= */
  private registerShutdownHooks(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, closing Sabre session...`);
      try {
        await this.logout();
      } finally {
        process.exit(0);
      }
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  }
}