import { BaseGDSConnector } from "./base-connector";

export class SabreConnector extends BaseGDSConnector<any> {
  async login(): Promise<void> {
    
    throw new Error("Not implemented");
  }

  async logout(): Promise<void> {
    if (!this.isAuthenticated) {
      return;
    }
    throw new Error("Not implemented");
  }

  async searchProfiles(): Promise<any> {
    throw new Error("Not implemented");
  }

  async getProfile(): Promise<any | null> {
    throw new Error("Not implemented");
  }

  async getProfiles(): Promise<any[]> {
    throw new Error("Not implemented");
  }

  async createProfile(): Promise<string> {
    throw new Error("Not implemented");
  }

  async updateProfile(): Promise<any> {
    throw new Error("Not implemented");
  }

  async deleteProfile(): Promise<void> {
    throw new Error("Not implemented");
  }

  getGDSName(): string {
    return "SABRE";
  }
}
