import { SabreQueueBuilder } from "../../builders/sabre-queue.builder";
import { SabreSoapExecutor } from "../../executors/sabre-soap.executor";
import { BaseSabreService } from "../base-sabre.service";
import { Builder } from "xml2js";

export abstract class ProfilesBaseService extends BaseSabreService {
  protected readonly soapExecutor: SabreSoapExecutor;
  protected readonly xmlBuilder: Builder;
  protected readonly queueBuilder: SabreQueueBuilder;

  protected constructor() {
    super();
    this.soapExecutor = new SabreSoapExecutor(this.sabreConfig.endpoint);
    this.xmlBuilder = new Builder({
      headless: true,
      renderOpts: { pretty: false },
    });
    this.queueBuilder = new SabreQueueBuilder();
  }

  protected async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
  public extractErrors(response: any): string | null {
    const errorSources = [
      response?.Errors,
      response?.ResponseMessage?.Errors,
      response?.Error,
    ];

    for (const errorSource of errorSources) {
      if (errorSource) {
        if (errorSource.ErrorMessage) {
          if (Array.isArray(errorSource.ErrorMessage)) {
            return errorSource.ErrorMessage.map(
              (e: any) => e._ || e.$?.ShortText || e.toString(),
            ).join("; ");
          }
          return (
            errorSource.ErrorMessage._ ||
            errorSource.ErrorMessage.$?.ShortText ||
            errorSource.ErrorMessage.toString()
          );
        }

        if (errorSource.Error) {
          if (Array.isArray(errorSource.Error)) {
            return errorSource.Error.map(
              (e: any) => e._ || e.$?.ShortText || e.toString(),
            ).join("; ");
          }
          return (
            errorSource.Error._ ||
            errorSource.Error.$?.ShortText ||
            errorSource.Error.toString()
          );
        }

        return JSON.stringify(errorSource);
      }
    }

    return null;
  }
}
