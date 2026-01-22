import { ConfigManager } from "../config/config.manager";
import { SabreSessionService } from "./sabreSessionService.service";

export abstract class BaseSabreService {
  protected readonly sabreConfig = ConfigManager.getInstance().sabre;
  protected readonly sessionService = SabreSessionService.getInstance();
  protected readonly queueConfig = ConfigManager.getInstance().queue;
  protected constructor() {}
}
