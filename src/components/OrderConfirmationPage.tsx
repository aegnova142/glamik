import React from 'react';
import { Order } from '../types';
import {
  Sparkles,
  CheckCircle,
  Truck,
  ArrowRight,
  Package,
  Calendar,
  MapPin,
  CreditCard,
  Download,
  Share2,
} from 'lucide-react';
import { motion } from 'motion/react';

interface OrderConfirmationPageProps {
  order: Order;
  onTrackOrder: (orderId: string) => void;
  onContinueShopping: () => void;
  onNavigateMyGlam: () => void;
}

export const OrderConfirmationPage: React.FC<OrderConfirmationPageProps> = ({
  order,
  onTrackOrder,
  onContinueShopping,
  onNavigateMyGlam,
}) => {
  const pointsEarned = Math.round(order.total / 10);

  return (
    <div className="bg-[#FAF9F6] min-h-screen py-12 sm:py-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Animated Confirmation Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="text-center space-y-4 mb-10"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#0B0B0B] text-[#C9972B] shadow-xl mb-2">
            <CheckCircle className="w-8 h-8 stroke-[1.5]" />
          </div>

          <span className="text-[10.5px] font-semibold tracking-[0.26em] uppercase text-[#C9972B] block">
            ORDER CONFIRMED • {order.orderNumber}
          </span>

          <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl text-[#121212] tracking-tight">
            YOUR GLAM IS ON ITS WAY.
          </h1>

          <p className="text-xs sm:text-sm text-[#6B6B6B] max-w-md mx-auto font-light leading-relaxed">
            Thank you for choosing Glamirk. Your formulations are being prepared and bottled in our signature luxury gift packaging.
          </p>

          {/* Privé Reward Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#FAF9F6] border border-[#E8D5A8] text-xs text-[#121212]">
            <Sparkles className="w-4 h-4 text-[#C9972B]" />
            <span>
              <strong>+{pointsEarned} Points</strong> added to your Glamirk Privé account.
            </span>
          </div>
        </motion.div>

        {/* Order Details & Summary Card */}
        <motion.div
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="bg-white border border-[#E8D5A8] p-6 sm:p-8 space-y-8 shadow-xs"
        >
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-6 border-b border-[#E8D5A8] text-xs">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-[#6B6B6B] block">
                ORDER NUMBER
              </span>
              <span className="font-mono font-semibold text-[#121212] mt-0.5 block">
                #{order.orderNumber}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-[#6B6B6B] block">
                ESTIMATED ARRIVAL
              </span>
              <span className="font-medium text-[#C9972B] mt-0.5 block">
                {order.estimatedDelivery}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-[#6B6B6B] block">
                PAYMENT METHOD
              </span>
              <span className="font-medium text-[#121212] uppercase mt-0.5 block">
                {order.payment.method}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-[#6B6B6B] block">
                TOTAL PAID
              </span>
              <span className="font-serif text-base font-semibold text-[#121212] mt-0.5 block">
                ₹{order.total}
              </span>
            </div>
          </div>

          {/* Itemized Items */}
          <div className="space-y-3">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-[#6B6B6B] block">
              ITEMS RESERVED IN THIS SHIPMENT:
            </span>

            <div className="divide-y divide-[#FAF9F6]">
              {order.items.map((item, idx) => (
                <div key={idx} className="py-3.5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <img
                      src={item.productImage}
                      alt={item.productName}
                      className="w-14 h-16 object-cover bg-[#FAF9F6] border border-[#E8D5A8]"
                    />
                    <div>
                      <h4 className="font-serif text-sm text-[#121212]">
                        {item.productName}
                      </h4>
                      <p className="text-xs text-[#6B6B6B]">
                        {item.shade ? `Shade: ${item.shade.name}` : item.size ? `Size: ${item.size}` : ''}
                        {' '}• Qty: {item.quantity}
                      </p>
                    </div>
                  </div>

                  <span className="font-serif text-sm font-medium text-[#121212]">
                    ₹{item.price * item.quantity}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Delivery & Dispatch Summary Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-[#E8D5A8] text-xs">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[#6B6B6B] uppercase tracking-wider font-semibold text-[10px]">
                <MapPin className="w-3.5 h-3.5 text-[#C9972B]" />
                <span>DISPATCH DESTINATION</span>
              </div>
              <p className="font-medium text-[#121212]">
                {order.deliveryAddress.name} ({order.deliveryAddress.type})
              </p>
              <p className="text-[#6B6B6B]">
                {order.deliveryAddress.addressLine1}
                {order.deliveryAddress.addressLine2 && `, ${order.deliveryAddress.addressLine2}`}
              </p>
              <p className="text-[#6B6B6B]">
                {order.deliveryAddress.city}, {order.deliveryAddress.state} - {order.deliveryAddress.pinCode}
              </p>
              <p className="text-[#6B6B6B] font-mono">
                Phone: {order.deliveryAddress.phone}
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[#6B6B6B] uppercase tracking-wider font-semibold text-[10px]">
                <Truck className="w-3.5 h-3.5 text-[#C9972B]" />
                <span>EXPEDITION PARTNER</span>
              </div>
              <p className="font-medium text-[#121212]">
                {order.courierPartner || 'Blue Dart Apex Premier'}
              </p>
              <p className="text-[#6B6B6B]">
                Tracking AWB: <span className="font-mono">{order.trackingNumber}</span>
              </p>
              <p className="text-[#6B6B6B] text-[11px]">
                Status updates will be notified via SMS and email.
              </p>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="pt-6 border-t border-[#E8D5A8] flex flex-col sm:flex-row items-center justify-between gap-4">
            <button
              onClick={() => onTrackOrder(order.id)}
              className="w-full sm:w-auto px-8 py-3.5 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-[0.2em] uppercase hover:bg-[#0B0B0B] transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            >
              <Truck className="w-4 h-4 text-[#C9972B]" />
              <span>LIVE ORDER TRACKING</span>
            </button>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                onClick={onNavigateMyGlam}
                className="flex-1 sm:flex-initial px-5 py-3.5 border border-[#E8D5A8] text-[#121212] text-xs font-semibold tracking-wider uppercase hover:bg-[#FAF9F6] transition-colors cursor-pointer text-center"
              >
                MY GLAM ACCOUNT
              </button>

              <button
                onClick={onContinueShopping}
                className="flex-1 sm:flex-initial px-5 py-3.5 border border-[#0B0B0B] bg-[#FAF9F6] text-[#121212] text-xs font-semibold tracking-wider uppercase hover:bg-[#0B0B0B] hover:text-white transition-colors cursor-pointer text-center"
              >
                CONTINUE SHOPPING
              </button>
            </div>
          </div>

        </motion.div>

      </div>
    </div>
  );
};
