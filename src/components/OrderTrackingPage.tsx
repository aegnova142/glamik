import React, { useState } from 'react';
import { Order, OrderStatus } from '../types';
import { SAMPLE_ORDERS } from '../data/commerce';
import {
  Truck,
  CheckCircle2,
  Clock,
  Package,
  MapPin,
  Search,
  ArrowLeft,
  Headphones,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { motion } from 'motion/react';

interface OrderTrackingPageProps {
  orders: Order[];
  initialOrderId?: string;
  onBackToAccount: () => void;
  onExploreShop: () => void;
  onOpenSupport: () => void;
  onReorder: (productId: string) => void;
}

export const OrderTrackingPage: React.FC<OrderTrackingPageProps> = ({
  orders,
  initialOrderId,
  onBackToAccount,
  onExploreShop,
  onOpenSupport,
  onReorder,
}) => {
  const allAvailableOrders = orders.length > 0 ? orders : SAMPLE_ORDERS;
  const defaultOrder =
    allAvailableOrders.find((o) => o.id === initialOrderId || o.orderNumber === initialOrderId) ||
    allAvailableOrders[0];

  const [selectedOrder, setSelectedOrder] = useState<Order>(defaultOrder);
  const [searchQuery, setSearchQuery] = useState(defaultOrder?.orderNumber || '');

  const handleSearchOrder = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = searchQuery.trim().toUpperCase().replace('#', '');
    const found = allAvailableOrders.find(
      (o) => o.orderNumber.toUpperCase() === clean || o.id === clean || o.trackingNumber?.toUpperCase() === clean
    );
    if (found) {
      setSelectedOrder(found);
    } else {
      alert(`Order "${searchQuery}" not found. Please verify the order number.`);
    }
  };

  const steps: { status: OrderStatus; label: string; description: string }[] = [
    {
      status: 'PLACED',
      label: 'ORDER PLACED',
      description: 'Reservation registered & order confirmed at Atelier.',
    },
    {
      status: 'CONFIRMED',
      label: 'CONFIRMED & ALLOCATED',
      description: 'Formulations inspected by color master.',
    },
    {
      status: 'PACKED',
      label: 'SIGNATURE PACKAGING',
      description: 'Bottled in champagne gift boxing with gold wax seal.',
    },
    {
      status: 'SHIPPED',
      label: 'DISPATCHED IN TRANSIT',
      description: 'Air courier consignment in transit to destination hub.',
    },
    {
      status: 'OUT_FOR_DELIVERY',
      label: 'OUT FOR DELIVERY',
      description: 'Courier executive assigned for doorstep handover.',
    },
    {
      status: 'DELIVERED',
      label: 'DELIVERED',
      description: 'Successfully received.',
    },
  ];

  const getStatusIndex = (st: OrderStatus) => {
    switch (st) {
      case 'PLACED':
        return 0;
      case 'CONFIRMED':
        return 1;
      case 'PACKED':
        return 2;
      case 'SHIPPED':
        return 3;
      case 'OUT_FOR_DELIVERY':
        return 4;
      case 'DELIVERED':
        return 5;
      default:
        return 0;
    }
  };

  const currentStatusIdx = getStatusIndex(selectedOrder.status);

  return (
    <div className="bg-[#FAF9F6] min-h-screen py-10 sm:py-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Navigation back */}
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={onBackToAccount}
            className="flex items-center gap-1.5 text-xs text-[#6B6B6B] hover:text-[#121212] font-medium transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>BACK TO MY GLAM</span>
          </button>

          <button
            onClick={onOpenSupport}
            className="flex items-center gap-1.5 text-xs text-[#C9972B] hover:underline font-medium cursor-pointer"
          >
            <Headphones className="w-4 h-4" />
            <span>CONTACT CONCIERGE</span>
          </button>
        </div>

        {/* Page Title */}
        <div className="mb-8 border-b border-[#E8D5A8] pb-4">
          <span className="text-[10px] font-semibold tracking-[0.24em] uppercase text-[#C9972B]">
            REAL-TIME DISPATCH LOGISTICS
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl text-[#121212] mt-1">
            TRACK YOUR ORDER
          </h1>
          <p className="text-xs text-[#6B6B6B] mt-1">
            Live status of your reserved Glamirk formulations from our Mumbai atelier.
          </p>
        </div>

        {/* Search Order Number Strip */}
        <form onSubmit={handleSearchOrder} className="mb-8 p-4 bg-white border border-[#E8D5A8] flex gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#6B6B6B] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ENTER ORDER NUMBER (e.g. GLM-89104) OR TRACKING AWB"
              className="w-full pl-9 pr-3 py-2.5 text-xs bg-[#FAF9F6] border border-[#E8D5A8] focus:border-[#0B0B0B] focus:outline-hidden font-mono uppercase"
            />
          </div>
          <button
            type="submit"
            className="px-6 py-2.5 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-wider uppercase hover:bg-[#0B0B0B] transition-colors cursor-pointer flex-shrink-0"
          >
            TRACK
          </button>
        </form>

        {/* Main Status Container */}
        <div className="bg-white border border-[#E8D5A8] p-6 sm:p-8 space-y-8 shadow-xs">
          
          {/* Header Strip with Current Status */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E8D5A8] pb-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif text-2xl text-[#121212]">
                  #{selectedOrder.orderNumber}
                </span>
                <span className="px-2.5 py-0.5 bg-[#0B0B0B] text-[#FAF9F6] text-[10px] font-semibold tracking-widest uppercase">
                  {selectedOrder.status}
                </span>
              </div>
              <p className="text-xs text-[#6B6B6B] mt-1">
                Placed on {selectedOrder.createdAt} • Priority Luxury Air Courier
              </p>
            </div>

            <div className="text-left sm:text-right">
              <span className="text-[10px] uppercase tracking-wider text-[#6B6B6B] block">
                ESTIMATED ARRIVAL
              </span>
              <span className="font-serif text-lg font-semibold text-[#C9972B] mt-0.5 block">
                {selectedOrder.estimatedDelivery}
              </span>
            </div>
          </div>

          {/* Vertical/Horizontal Timeline */}
          <div className="space-y-6">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-[#6B6B6B] block">
              DISPATCH TIMELINE:
            </span>

            <div className="relative pl-6 sm:pl-8 space-y-8 before:absolute before:left-3 sm:before:left-4 before:top-2 before:bottom-2 before:w-[2px] before:bg-[#E8D5A8]">
              {steps.map((step, idx) => {
                const isPassed = idx <= currentStatusIdx;
                const isCurrent = idx === currentStatusIdx;

                return (
                  <div key={step.status} className="relative flex items-start gap-4">
                    {/* Node Dot */}
                    <div
                      className={`absolute -left-6 sm:-left-8 top-0.5 w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all ${
                        isPassed
                          ? 'bg-[#0B0B0B] border-[#0B0B0B] text-[#C9972B]'
                          : 'bg-white border-[#E8D5A8] text-transparent'
                      }`}
                    >
                      {isPassed && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </div>

                    {/* Step details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4
                          className={`font-serif text-sm font-medium tracking-wide ${
                            isCurrent
                              ? 'text-[#121212] font-semibold'
                              : isPassed
                              ? 'text-[#121212]'
                              : 'text-[#6B6B6B]'
                          }`}
                        >
                          {step.label}
                        </h4>
                        {isCurrent && (
                          <span className="px-2 py-0.5 bg-[#C9972B]/10 text-[#C9972B] text-[9.5px] font-semibold tracking-widest uppercase">
                            CURRENT STATUS
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#6B6B6B] mt-0.5">
                        {step.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Courier & Waybill Information */}
          <div className="p-5 bg-[#FAF9F6] border border-[#E8D5A8] grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-[#6B6B6B] font-semibold block">
                CARRIER & AWB TRACKING
              </span>
              <p className="font-medium text-[#121212]">
                {selectedOrder.courierPartner || 'Blue Dart Air Express'}
              </p>
              <p className="font-mono text-[#6B6B6B]">
                AWB Reference: {selectedOrder.trackingNumber || 'BLUEDART-88291047'}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-[#6B6B6B] font-semibold block">
                DELIVERING TO
              </span>
              <p className="font-medium text-[#121212]">
                {selectedOrder.deliveryAddress.name} ({selectedOrder.deliveryAddress.type})
              </p>
              <p className="text-[#6B6B6B] truncate">
                {selectedOrder.deliveryAddress.city}, {selectedOrder.deliveryAddress.state} - {selectedOrder.deliveryAddress.pinCode}
              </p>
            </div>
          </div>

          {/* Products in Shipment */}
          <div className="space-y-3 pt-2">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-[#6B6B6B] block">
              ITEMS IN THIS SHIPMENT:
            </span>

            <div className="divide-y divide-[#FAF9F6] border border-[#E8D5A8] bg-[#FAF9F6]">
              {selectedOrder.items.map((item, idx) => (
                <div key={idx} className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <img
                      src={item.productImage}
                      alt={item.productName}
                      className="w-12 h-14 object-cover bg-white border border-[#E8D5A8]"
                    />
                    <div>
                      <h5 className="font-serif text-sm text-[#121212]">
                        {item.productName}
                      </h5>
                      <p className="text-xs text-[#6B6B6B]">
                        {item.shade ? `Shade: ${item.shade.name}` : item.size ? `Size: ${item.size}` : ''} • Qty: {item.quantity}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => onReorder(item.productId)}
                    className="px-4 py-2 border border-[#0B0B0B] bg-white text-[#121212] text-[11px] font-semibold tracking-wider uppercase hover:bg-[#0B0B0B] hover:text-white transition-colors cursor-pointer"
                  >
                    BUY AGAIN
                  </button>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
