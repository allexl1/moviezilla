export class BaseProvider {
  constructor({ id, name, priority = 10 }) {
    this.id = id;
    this.name = name;
    this.priority = priority;
  }

  // Must be implemented by subclasses
  async resolve(media) {
    throw new Error(`Method resolve() not implemented on provider ${this.id}`);
  }
}
