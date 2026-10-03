/// <reference types="phaser/types/matter.d.ts" />

declare module '@matter-js' {
  export type Body = MatterJS.BodyType;
  export type Composite = MatterJS.CompositeType;
  export type World = MatterJS.WorldType;
  export type Engine = MatterJS.EngineType;

  export namespace Matter {
    export type Body = MatterJS.BodyType;
    export type Composite = MatterJS.CompositeType;
    export type World = MatterJS.WorldType;
    export type Engine = MatterJS.EngineType;
  }

  export const Body: {
    setPosition(body: MatterJS.BodyType, position: { x: number; y: number }): void;
    setVelocity(body: MatterJS.BodyType, velocity: { x: number; y: number }): void;
    update(body: MatterJS.BodyType, deltaTime: number): void;
  };
  export const World: {
    add(world: MatterJS.WorldType, body: MatterJS.BodyType | MatterJS.BodyType[]): void;
    remove(world: MatterJS.WorldType, body: MatterJS.BodyType | MatterJS.BodyType[]): void;
    clear(world: MatterJS.WorldType, keepStatic?: boolean): void;
  };
  export const Engine: {
    create(options?: unknown): MatterJS.EngineType;
    update(engine: MatterJS.EngineType, delta?: number): MatterJS.EngineType;
  };
  export const Bodies: {
    rectangle(x: number, y: number, width: number, height: number, options?: unknown): MatterJS.BodyType;
    circle(x: number, y: number, radius: number, options?: unknown): MatterJS.BodyType;
  };

  const MatterExport: {
    Body: typeof Body;
    World: typeof World;
    Engine: typeof Engine;
    Bodies: typeof Bodies;
  };

  export default MatterExport;
}
