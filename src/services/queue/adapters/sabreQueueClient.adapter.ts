import {
  buildNavigationRequest,
  buildQueueAccessRequest,
} from "../../../connectors/Envelopes/otherEnvelopes";
import { hasQueueItem } from "../../../connectors/helpers/hasQueueItem";
import {
  IQueueClient,
  QueueResponse,
  QueueData,
} from "../../../constants/QueueConstant";

import { ProfilesBaseService } from "../../profile/profilesBase.service";
import { SabreQueueService } from "../queueCount.service";

export class SabreQueueClientAdapter
  extends ProfilesBaseService
  implements IQueueClient
{
  constructor(private readonly sabreQueueService: SabreQueueService) {
    super();
  }

  buildQueueAccessRequest(queueNumber: number): string {
    return buildQueueAccessRequest(
      String(this.sabreConfig.pcc),
      String(queueNumber),
    );
  }

  buildNavigationRequest(action: string): string {
    return buildNavigationRequest(action);
  }

  async sendQueueRequest(
    service: string,
    action: string,
    request: string,
  ): Promise<QueueResponse> {
    const sessionToken = await this.sessionService.getAccessToken();
    const response = await this.soapExecutor.execute({
      service,
      action,
      sessionToken,
      body: request,
    });

    return response as QueueResponse;
  }

  hasQueueItem(response: QueueResponse): boolean {
    return hasQueueItem(response);
  }

  async getQueueCount(queueNumber: number): Promise<{ queues: QueueData[] }> {
    const result = await this.sabreQueueService.getQueueCount(queueNumber);

    return {
      queues: result.queues.map((q) => ({
        queueNumber: q.queueNumber,
        count: q.count,
      })),
    };
  }
}
