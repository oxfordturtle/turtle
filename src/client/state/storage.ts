import { defaults, type Property } from "../constants/properties.ts";

export function load(property: Property): any {
  const fromStorage = sessionStorage.getItem(property);
  return fromStorage !== null ? JSON.parse(fromStorage) : defaults[property];
}

export function save(property: Property, value: any): void {
  sessionStorage.setItem(property, JSON.stringify(value));
}
