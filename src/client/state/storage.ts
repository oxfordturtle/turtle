import {
  defaults,
  type Property,
  type PropertyValues,
} from "../constants/properties.ts";

export function load<P extends Property>(property: P): PropertyValues[P] {
  const fromStorage = sessionStorage.getItem(property);
  return fromStorage !== null ? JSON.parse(fromStorage) : defaults[property];
}

export function save<P extends Property>(
  property: P,
  value: PropertyValues[P],
): void {
  sessionStorage.setItem(property, JSON.stringify(value));
}
