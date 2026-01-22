// singleton.base.ts
export abstract class SingletonService {
  private static instances = new Map<string, any>();

  protected constructor() {}

  protected static getInstanceInternal<T>(constructor: new () => T): T {
    const className = constructor.name;

    if (!SingletonService.instances.has(className)) {
      SingletonService.instances.set(className, new constructor());
    }

    return SingletonService.instances.get(className) as T;
  }
}
