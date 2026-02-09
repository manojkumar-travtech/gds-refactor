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

  private buildDeleteRequest(
    profileId: string,
    domainId: string,
    clientCode: string,
    clientContext: string,
  ): any {
    return {
      Sabre_OTA_ProfileDeleteRQ: {
        $: {
          Version: "6.99.2",
          xmlns: "http://www.sabre.com/eps/schemas",
        },
        Delete: {
          Profile: {
            $: {
              PurgeDays: "0",
            },
            TPA_Identity: {
              $: {
                UniqueID: profileId,
                DomainID: domainId,
                ClientCode: clientCode,
                ClientContextCode: clientContext,
                ProfileTypeCode: "TVL",
              },
            },
          },
        },
      },
    };
  }

  async deleteProfile(profileId: string): Promise<void> {
    const requestObj = this.buildDeleteRequest(
      profileId,
      this.sabreConfig.pcc,
      this.sabreConfig.clientCode ?? "TN",
      this.sabreConfig.clientContext ?? "TMP",
    );

    const bodyXml = this.xmlBuilder.buildObject(requestObj);
    const sessionToken = await this.sessionService.getAccessToken();

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