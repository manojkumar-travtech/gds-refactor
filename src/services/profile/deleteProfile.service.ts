import { ProfilesBaseService } from "./profilesBase.service";

export interface SabreProfileDeleteRS {
  Sabre_OTA_ProfileDeleteRS: {
    ApplicationResults?: {
      status: "Complete" | "NotProcessed";
    };
    Errors?: any;
    ResponseMessage?: any;
  };
}

export class DeleteProfileService extends ProfilesBaseService {
  private static instance: DeleteProfileService;

  private constructor() {
    super();
  }

  public static getInstance(): DeleteProfileService {
    if (!DeleteProfileService.instance) {
      DeleteProfileService.instance = new DeleteProfileService();
    }
    return DeleteProfileService.instance;
  }

  async deleteProfile(profileId: string) {
    const requestObj = this.profileBuilder.buildDeleteRequest(
      profileId,
      this.sabreConfig.pcc,
      this.sabreConfig.clientCode,
      this.sabreConfig.clientContext,
    );

    const bodyXml = this.xmlBuilder.buildObject(requestObj);
    const sessionToken: string = await this.sessionService.getAccessToken();
    await this.soapExecutor.execute<SabreProfileDeleteRS>(
      {
        action: "EPS_EXT_ProfileDeleteRQ",
        service: "Sabre_OTA_ProfileDeleteRQ",
        body: bodyXml,
        sessionToken,
      },
      "Sabre_OTA_ProfileDeleteRS",
    );
  }
}
