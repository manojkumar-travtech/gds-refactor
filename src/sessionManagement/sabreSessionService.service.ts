import logger from "../utils/logger";

export class SabreSessionService {
  private static instance: SabreSessionService;

  // 👉 Put your static Sabre token here
  private static readonly STATIC_TOKEN =
    "Shared/IDL:IceSess\/SessMgr:1\\.0.IDL/Common/!ICESMS\/RESB!ICESMSLB\/RES.LB!1770121028355!6383!549";

  private constructor() {
    logger.warn("⚠️ SabreSessionService running in STATIC TOKEN mode (NO AUTH)");
  }

  /* =======================
     Singleton
  ======================= */
  static getInstance(): SabreSessionService {
    if (!SabreSessionService.instance) {
      SabreSessionService.instance = new SabreSessionService();
    }
    return SabreSessionService.instance;
  }

  /* =======================
     No-op Login
  ======================= */
  async login(): Promise<void> {
    return;
  }

  /* =======================
     No-op Ensure Session
  ======================= */
  async ensureSession(): Promise<void> {
    return;
  }

  /* =======================
     Access Token
  ======================= */
  async getAccessToken(): Promise<string> {
    return SabreSessionService.STATIC_TOKEN;
  }

  /* =======================
     Conversation Id (not used)
  ======================= */
  async getConversationId(): Promise<string | undefined> {
    return undefined;
  }

  /* =======================
     No-op Logout
  ======================= */
  async logout(): Promise<void> {
    return;
  }
}