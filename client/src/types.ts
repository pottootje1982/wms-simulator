export interface Vec3 {
  x: number;
  y: number;
  floor: number;
}
export type CellType =
  | 'empty'
  | 'shelf'
  | 'wall'
  | 'elevator_shaft'
  | 'conveyor'
  | 'charging_station'
  | 'operator_station';
export type ConveyorDir = 'N' | 'S' | 'E' | 'W';
export interface Cell {
  type: CellType;
  entityId?: string;
  conveyorDir?: ConveyorDir;
}
export interface WorldConfig {
  width: number;
  depth: number;
  floors: number;
}
export type RobotStatus =
  | 'idle'
  | 'navigating_to_pickup'
  | 'picking_up'
  | 'navigating_to_dropoff'
  | 'dropping_off'
  | 'navigating_to_elevator'
  | 'waiting_for_elevator'
  | 'in_elevator'
  | 'charging';
export interface Robot {
  id: string;
  name: string;
  position: Vec3;
  prevPosition: Vec3;
  visualOffset: number;
  status: RobotStatus;
  heldParcelId?: string;
  taskId?: string;
  color: string;
  battery: number;
  basePosition: Vec3;
}
export interface ShelfSlot {
  row: number;
  col: number;
  parcelId?: string;
}
export interface Shelf {
  id: string;
  label: string;
  accessPosition: Vec3;
  shelfPosition: Vec3;
  rows: number;
  cols: number;
  slots: ShelfSlot[][];
  facing?: 'E' | 'W' | 'N' | 'S';
}
export type ElevatorStatus =
  | 'idle'
  | 'moving_up'
  | 'moving_down'
  | 'doors_open';
export interface Elevator {
  id: string;
  x: number;
  y: number;
  floors: number[];
  currentFloor: number;
  targetFloor?: number;
  status: ElevatorStatus;
  occupantIds: string[];
}
export interface ConveyorCell {
  x: number;
  y: number;
  floor: number;
  direction: ConveyorDir;
}
export interface Conveyor {
  id: string;
  label?: string;
  cells: ConveyorCell[];
  active: boolean;
  speedTicks: number;
}
export type ParcelStatus =
  | 'on_shelf'
  | 'being_carried'
  | 'on_conveyor'
  | 'delivered';
export interface Parcel {
  id: string;
  label: string;
  color: string;
  status: ParcelStatus;
  shelfId?: string;
  slotRow?: number;
  slotCol?: number;
  carriedBy?: string;
  position?: Vec3;
  destination?: Vec3;
}
export interface Operator {
  id: string;
  name: string;
  position: Vec3;
}
export interface Wall {
  id: string;
  position: Vec3;
}
export type TaskStatus =
  | 'queued'
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'failed';
export interface TransferTask {
  id: string;
  parcelId: string;
  targetPosition: Vec3;
  targetShelfId?: string;
  targetSlotRow?: number;
  targetSlotCol?: number;
  robotId?: string;
  status: TaskStatus;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface FullStatePayload {
  tick: number;
  running: boolean;
  ticksPerSecond: number;
  config: WorldConfig;
  robots: Robot[];
  shelves: Shelf[];
  elevators: Elevator[];
  conveyors: Conveyor[];
  parcels: Parcel[];
  operators: Operator[];
  walls: Wall[];
  tasks: TransferTask[];
}
export interface TickUpdatePayload {
  tick: number;
  robots: Robot[];
  elevators: Elevator[];
  parcels: Parcel[];
  tasks: TransferTask[];
}
export type SimEventType =
  | 'parcel_picked_up'
  | 'parcel_dropped_off'
  | 'task_completed'
  | 'task_failed'
  | 'robot_idle'
  | 'elevator_arrived';
export interface SimEvent {
  type: SimEventType;
  tick: number;
  data: Record<string, unknown>;
}
export type WSMsgType = 'full_state' | 'tick_update' | 'sim_event' | 'error';
export interface WSMessage {
  type: WSMsgType;
  payload:
    | FullStatePayload
    | TickUpdatePayload
    | SimEvent
    | { message: string };
}
