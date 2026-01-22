import { SabreProfileBuilder } from "../../builders/sabre-profile.builder";
import { SabreQueueBuilder } from "../../builders/sabre-queue.builder";
import { SabreSoapExecutor } from "../../executors/sabre-soap.executor";
import { BaseSabreService } from "../base-sabre.service";
import { Builder } from "xml2js";

export abstract class ProfilesBaseService extends BaseSabreService {
  protected readonly soapExecutor: SabreSoapExecutor;
  protected readonly xmlBuilder: Builder;
  protected readonly profileBuilder: SabreProfileBuilder;
  protected readonly queueBuilder: SabreQueueBuilder;

  protected constructor() {
    super();
    this.soapExecutor = new SabreSoapExecutor(this.sabreConfig.endpoint);
    this.xmlBuilder = new Builder({
      headless: true,
      renderOpts: { pretty: false },
    });
    this.profileBuilder = new SabreProfileBuilder();
    this.queueBuilder = new SabreQueueBuilder();
  }

  protected async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
