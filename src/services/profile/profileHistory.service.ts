import { ProfilesBaseService } from "./profilesBase.service";

export class ProfileHistoryService extends ProfilesBaseService {
  private static instance: ProfileHistoryService;

  private constructor() {
    super();
  }
  public static getInstance(): ProfileHistoryService {
    if (!ProfileHistoryService.instance) {
      ProfileHistoryService.instance = new ProfileHistoryService();
    }
    return ProfileHistoryService.instance;
  }
  public async profileHistory(profileId: string): Promise<void> {
    const bodyContent = `
      <Sabre_OTA_ProfileHistoryRQ Target="Production" TimeStamp="${new Date().toISOString()}" Version="6.90.1" xmlns="http://www.sabre.com/eps/schemas">
        <Profile>
          <TPA_Identity 
            ClientCode="${this.sabreConfig.clientCode}" 
            ClientContextCode="${this.sabreConfig.clientContext}" 
            UniqueID="${profileId}" 
            ProfileTypeCode="ALL" 
            DomainID="${this.sabreConfig.pcc}"
          />
        </Profile>
      </Sabre_OTA_ProfileHistoryRQ>`;
    return this.soapExecutor.execute(
      {
        service: "Sabre_OTA_ProfileHistoryRQ",
        action: "EPS_EXT_ProfileHistoryRQ",
        body: bodyContent,
        sessionToken: await this.sessionService.getAccessToken(),
      },
      "Sabre_OTA_ProfileHistoryRS",
    );
  }
}
