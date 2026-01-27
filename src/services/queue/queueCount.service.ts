import { buildQueueCountRequest } from "../../connectors/Envelopes/otherEnvelopes";
import { parseQueueCountResponse } from "../../parsers/parseQueueCountResponse";
import { ProfilesBaseService } from "../profile/profilesBase.service";

export interface ActiveQueue {
  queueNumber: string;
  pnrCount: number;
}

export class SabreQueueService extends ProfilesBaseService {
  private static instance: SabreQueueService | null = null;
  private static instancePromise: Promise<SabreQueueService> | null = null;

  private constructor() {
    super();
  }

  /**
   * Async-safe singleton accessor
   */
  public static async getInstance(): Promise<SabreQueueService> {
    if (SabreQueueService.instance) {
      return SabreQueueService.instance;
    }

    if (!SabreQueueService.instancePromise) {
      SabreQueueService.instancePromise = (async () => {
        const service = new SabreQueueService();
        SabreQueueService.instance = service;
        return service;
      })();
    }

    return SabreQueueService.instancePromise;
  }

  async getQueueCount(queueNumber: string | number | null = null) {
    const sessionToken = await this.sessionService.getAccessToken();
    const body = buildQueueCountRequest({
      queueNumber: queueNumber ? String(queueNumber) : null,
      pcc: String(this.sabreConfig.pcc),
    });

    const response = await this.soapExecutor.execute({
      service: "Queue",
      action: "QueueCountLLSRQ",
      sessionToken,
      body,
    });

    return parseQueueCountResponse(response as any, queueNumber);
  }

  async getActiveQueues(): Promise<ActiveQueue[]> {
    const result = await this.getQueueCount();

    return result.queues
      .filter((q) => q.count > 0)
      .map((q) => ({
        queueNumber: q.queueNumber,
        pnrCount: q.count,
      }));
  }
}
