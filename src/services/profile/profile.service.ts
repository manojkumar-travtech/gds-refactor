import { CreateProfileService } from "./createProfile.service";
import { DeleteProfileService } from "./deleteProfile.service";
import { ProfileSearchService } from "./searchProfile.service";
import { UpdateProfileService } from "./updateProfile.service";

type CombinedService =
  & CreateProfileService
  & ProfileSearchService
  & DeleteProfileService
  & UpdateProfileService;

function bindMethods<T extends object>(instance: T): T {
  const proto = Object.getPrototypeOf(instance);

  const methodNames = Object.getOwnPropertyNames(proto).filter(
    (name) =>
      name !== "constructor" &&
      typeof (instance as any)[name] === "function"
  );

  const bound: any = {};

  for (const name of methodNames) {
    bound[name] = (instance as any)[name].bind(instance);
  }

  return bound as T;
}

export class ProfileService {
  private static instance: CombinedService;

  private constructor() {}

  public static getInstance(): CombinedService {
    if (!this.instance) {
      const services: CombinedService = Object.assign(
        {},
        bindMethods(CreateProfileService.getInstance()),
        bindMethods(ProfileSearchService.getInstance()),
        bindMethods(DeleteProfileService.getInstance()),
        bindMethods(UpdateProfileService.getInstance())
      );

      this.instance = new Proxy<CombinedService>(services, {
        get(target, prop: keyof CombinedService) {
          if (prop in target) return target[prop];
          throw new Error(`ProfileService: Method ${String(prop)} not found`);
        },
      });
    }

    return this.instance;
  }
}