export type ContainerStatus = 'booked' | 'in_transit' | 'at_port' | 'customs_hold' | 'cleared' | 'delivered';

export type CustomsStatus = 'not_started' | 'under_review' | 'cleared' | 'held' | 'rejected';

export interface PortAssignment {
  portCode: string;
  portName: string;
  berth?: string;
  eta: string;
}

export interface FreightContainer {
  id: string;
  containerNumber: string;
  sellerIds: string[];
  originCountry: string;
  destinationPort: string;
  status: ContainerStatus;
  customsStatus: CustomsStatus;
  portAssignment: PortAssignment;
  orderCount: number;
  departedAt?: string;
  estimatedArrival: string;
}
