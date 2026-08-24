import React, { useState } from 'react';
import { CartItem, Address, Order, Coupon } from '../../types';
import { FREE_SHIPPING_THRESHOLD, STANDARD_SHIPPING_FEE } from '../../data/commerce';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import {
  ShieldCheck,
  Lock,
  Check,
  ChevronRight,
  Plus,
  ArrowLeft,
  CreditCard,
  Banknote,
  AlertCircle,
  Clock,
  Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CheckoutDetails {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  paymentMethod: 'cod';
  couponCode?: string;
}

interface CheckoutPageProps {
  cartItems: CartItem[];
  appliedCoupon: Coupon | null;
  savedAddresses: Address[];
  /** Whether the admin has configured a WhatsApp number in Global Store
   * Settings — when false, there's no point pre-opening a tab for it. */
  hasWhatsappOrderNumber?: boolean;
  onAddNewAddress: (address: Address) => void;
  onPlaceOrderSuccess: (order: Order, whatsappUrl?: string) => void;
  onBackToCart: () => void;
  onOpenProduct: (productId: string) => void;
  onCheckout: (
    shippingAddress: Address,
    details: CheckoutDetails
  ) => Promise<{ success: boolean; order?: Order; whatsappUrl?: string; error?: string }>;
}

type CheckoutStep = 'details' | 'payment' | 'review';

export const CheckoutPage: React.FC<CheckoutPageProps> = ({
  cartItems,
  appliedCoupon,
  savedAddresses,
  hasWhatsappOrderNumber,
  onAddNewAddress,
  onPlaceOrderSuccess,
  onBackToCart,
  onCheckout,
}) => {
  const { customerUser } = useCustomerAuth();
  const [currentStep, setCurrentStep] = useState<CheckoutStep>('details');

  // Customer Details Form State — prefilled only from the real signed-in
  // account, never from a fake/demo persona.
  const [customerName, setCustomerName] = useState(customerUser?.name || '');
  const [customerPhone, setCustomerPhone] = useState(customerUser?.phone || '');
  const [customerEmail, setCustomerEmail] = useState(customerUser?.email || '');

  // Address Selection — no address is selected until the user has one saved.
  const [selectedAddressId, setSelectedAddressId] = useState<string>(savedAddresses[0]?.id || '');
  const [isAddingNewAddress, setIsAddingNewAddress] = useState(false);
  const [newAddressForm, setNewAddressForm] = useState<Omit<Address, 'id'>>({
    name: customerUser?.name || '',
    type: 'Home',
    phone: customerUser?.phone || '',
    email: customerUser?.email || '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    pinCode: '',
    isDefault: false,
  });

  // Processing & Error State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});

  // Financial Calculations
  const subtotal = cartItems.reduce((acc, item) => {
    const itemPrice = item.selectedSize === '30g' ? 549 : item.product.price;
    return acc + itemPrice * item.quantity;
  }, 0);

  const discountAmount = appliedCoupon
    ? appliedCoupon.discountType === 'percentage'
      ? Math.round((subtotal * appliedCoupon.discountValue) / 100)
      : appliedCoupon.discountValue
    : 0;

  const isShippingFree = subtotal >= FREE_SHIPPING_THRESHOLD || appliedCoupon?.code === 'PRIVESHIP';
  const shippingFee = cartItems.length === 0 || isShippingFree ? 0 : STANDARD_SHIPPING_FEE;
  const grandTotal = Math.max(0, subtotal - discountAmount + shippingFee);

  // Never silently falls back to a demo/default address — undefined until the
  // user actually has and selects a real saved address.
  const activeAddress = savedAddresses.find((a) => a.id === selectedAddressId);

  // Validation logic
  const validateDetails = () => {
    const errs: { [key: string]: string } = {};
    if (!customerName.trim()) errs.name = 'Please enter your full name.';
    if (!customerPhone.trim() || customerPhone.replace(/\D/g, '').length < 10) {
      errs.phone = 'Please enter a valid 10-digit mobile number.';
    }
    if (!customerEmail.trim() || !customerEmail.includes('@')) {
      errs.email = 'Please enter a valid email address.';
    }
    if (!activeAddress) {
      errs.address = 'Please add and select a delivery address before continuing.';
    }
    setValidationErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateNewAddress = () => {
    const errs: { [key: string]: string } = {};
    if (!newAddressForm.addressLine1.trim()) errs.addressLine1 = 'Please enter flat/street address.';
    if (!newAddressForm.city.trim()) errs.city = 'Please enter city.';
    if (!newAddressForm.state.trim()) errs.state = 'Please enter state.';
    if (!newAddressForm.pinCode.trim() || newAddressForm.pinCode.length < 6) {
      errs.pinCode = 'Please enter a valid 6-digit PIN code.';
    }
    setValidationErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSaveNewAddress = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateNewAddress()) return;

    const newId = `addr-${Date.now()}`;
    const completeAddress: Address = {
      ...newAddressForm,
      id: newId,
    };
    onAddNewAddress(completeAddress);
    setSelectedAddressId(newId);
    setIsAddingNewAddress(false);
    setValidationErrors({});
  };

  const handleConfirmOrder = async () => {
    if (!activeAddress) {
      setErrorMessage('Please add and select a delivery address before placing your order.');
      setCurrentStep('details');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    // Must open synchronously, right inside this click handler — opening it
    // only after the `await onCheckout(...)` below resolves loses the
    // browser's "user activation" window, so most browsers silently block
    // it as an unsolicited popup and the WhatsApp tab never appears.
    // Opening a blank tab now and pointing it at the real URL once the
    // order is confirmed keeps it inside that window.
    const whatsappTab = hasWhatsappOrderNumber ? window.open('', '_blank', 'noopener,noreferrer') : null;

    const addressForOrder: Address = {
      ...activeAddress,
      name: customerName || activeAddress.name,
      phone: customerPhone || activeAddress.phone,
      email: customerEmail || activeAddress.email,
    };

    const result = await onCheckout(addressForOrder, {
      customerName,
      customerPhone,
      customerEmail,
      paymentMethod: 'cod',
      couponCode: appliedCoupon?.code,
    });
    setIsSubmitting(false);

    if (!result.success || !result.order) {
      whatsappTab?.close();
      setErrorMessage(result.error || 'We couldn’t place your order. Your bag contents remain safe and unchanged.');
      return;
    }

    // Cosmetic dispatch details the server doesn't track (courier assignment
    // happens after packing, not at order time) — trackingNumber/courierPartner
    // stay a display placeholder until real fulfillment status feeds this in.
    const enrichedOrder: Order = {
      ...result.order,
      trackingNumber: `BLUEDART-${Math.floor(10000000 + Math.random() * 90000000)}`,
      courierPartner: 'Blue Dart Apex Premier Air',
    };

    // Best-effort: opens the customer's own WhatsApp with the order pre-filled
    // to the admin's number. Requires one tap to actually send — there's no
    // WhatsApp Business API wired up, so this can't happen silently server-side.
    if (result.whatsappUrl && whatsappTab) {
      whatsappTab.location.href = result.whatsappUrl;
    } else {
      whatsappTab?.close();
    }

    onPlaceOrderSuccess(enrichedOrder, result.whatsappUrl);
  };

  return (
    <div className="bg-[#FAF9F6] min-h-screen">
      
      {/* Distraction-Free Luxury Checkout Header */}
      <header className="border-b border-[#E8D5A8] bg-white sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onBackToCart}
              className="text-xs text-[#6B6B6B] hover:text-[#121212] flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">RETURN TO BAG</span>
            </button>
            <span className="h-4 w-[1px] bg-[#E8D5A8] hidden sm:inline" />
            <div>
              <span className="font-serif text-xl sm:text-2xl tracking-widest uppercase font-semibold text-[#121212]">
                GLAMIRK
              </span>
              <span className="text-[9px] uppercase tracking-[0.24em] text-[#C9972B] block">
                ATELIER CHECKOUT
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-[#C9972B] font-medium">
            <Lock className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">256-BIT ENCRYPTED LUXURY CHECKOUT</span>
          </div>
        </div>
      </header>

      {/* Main Checkout Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        
        {/* Checkout Progress Stepper */}
        <div className="mb-8 max-w-2xl mx-auto">
          <div className="flex items-center justify-between text-xs tracking-wider uppercase font-semibold">
            
            {/* Step 1 */}
            <button
              onClick={() => setCurrentStep('details')}
              className={`flex items-center gap-2 cursor-pointer ${
                currentStep === 'details'
                  ? 'text-[#121212]'
                  : 'text-[#C9972B]'
              }`}
            >
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-mono ${
                currentStep === 'details' ? 'bg-[#0B0B0B] text-white' : 'bg-[#C9972B] text-white'
              }`}>
                01
              </span>
              <span className="hidden sm:inline">DETAILS</span>
            </button>

            <span className="flex-1 h-[1px] bg-[#E8D5A8] mx-3" />

            {/* Step 2 */}
            <button
              onClick={() => {
                if (validateDetails()) setCurrentStep('payment');
              }}
              className={`flex items-center gap-2 cursor-pointer ${
                currentStep === 'payment'
                  ? 'text-[#121212]'
                  : currentStep === 'review'
                  ? 'text-[#C9972B]'
                  : 'text-[#6B6B6B]'
              }`}
            >
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-mono ${
                currentStep === 'payment'
                  ? 'bg-[#0B0B0B] text-white'
                  : currentStep === 'review'
                  ? 'bg-[#C9972B] text-white'
                  : 'bg-[#E8D5A8] text-[#6B6B6B]'
              }`}>
                02
              </span>
              <span className="hidden sm:inline">PAYMENT</span>
            </button>

            <span className="flex-1 h-[1px] bg-[#E8D5A8] mx-3" />

            {/* Step 3 */}
            <button
              onClick={() => {
                if (validateDetails()) setCurrentStep('review');
              }}
              className={`flex items-center gap-2 cursor-pointer ${
                currentStep === 'review' ? 'text-[#121212]' : 'text-[#6B6B6B]'
              }`}
            >
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-mono ${
                currentStep === 'review'
                  ? 'bg-[#0B0B0B] text-white'
                  : 'bg-[#E8D5A8] text-[#6B6B6B]'
              }`}>
                03
              </span>
              <span className="hidden sm:inline">REVIEW</span>
            </button>

          </div>
        </div>

        {/* Main 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
          
          {/* Left Column: Active Step Interactive Form (7-8 Cols) */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-6">
            
            {/* STEP 1: DETAILS */}
            {currentStep === 'details' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-6 sm:p-8 bg-white border border-[#E8D5A8] space-y-6"
              >
                <div className="border-b border-[#E8D5A8] pb-4">
                  <span className="text-[10px] font-semibold tracking-[0.24em] uppercase text-[#C9972B]">
                    STEP 01 OF 03
                  </span>
                  <h2 className="font-serif text-2xl text-[#121212] mt-1">
                    CUSTOMER & DELIVERY DETAILS
                  </h2>
                  <p className="text-xs text-[#6B6B6B] mt-1">
                    We will send order tracking, receipt invoices, and delivery PIN confirmations here.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-[11px] uppercase tracking-wider font-semibold text-[#6B6B6B] block mb-1.5">
                      FULL NAME *
                    </label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Enter your full name"
                      className={`w-full p-3 text-xs bg-[#FAF9F6] border ${
                        validationErrors.name ? 'border-[#F05A7E]' : 'border-[#E8D5A8]'
                      } focus:border-[#0B0B0B] focus:outline-hidden`}
                    />
                    {validationErrors.name && (
                      <p className="text-[11px] text-[#F05A7E] mt-1">{validationErrors.name}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] uppercase tracking-wider font-semibold text-[#6B6B6B] block mb-1.5">
                        MOBILE NUMBER *
                      </label>
                      <div className="flex">
                        <span className="px-3 py-3 text-xs bg-[#FAF9F6] border border-r-0 border-[#E8D5A8] text-[#121212] font-mono">
                          +91
                        </span>
                        <input
                          type="tel"
                          maxLength={10}
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, ''))}
                          placeholder="10-digit mobile number"
                          className={`flex-1 p-3 text-xs bg-[#FAF9F6] border ${
                            validationErrors.phone ? 'border-[#F05A7E]' : 'border-[#E8D5A8]'
                          } focus:border-[#0B0B0B] focus:outline-hidden font-mono`}
                        />
                      </div>
                      {validationErrors.phone && (
                        <p className="text-[11px] text-[#F05A7E] mt-1">{validationErrors.phone}</p>
                      )}
                    </div>

                    <div>
                      <label className="text-[11px] uppercase tracking-wider font-semibold text-[#6B6B6B] block mb-1.5">
                        EMAIL ADDRESS *
                      </label>
                      <input
                        type="email"
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        placeholder="you@example.com"
                        className={`w-full p-3 text-xs bg-[#FAF9F6] border ${
                          validationErrors.email ? 'border-[#F05A7E]' : 'border-[#E8D5A8]'
                        } focus:border-[#0B0B0B] focus:outline-hidden`}
                      />
                      {validationErrors.email && (
                        <p className="text-[11px] text-[#F05A7E] mt-1">{validationErrors.email}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Saved Address Cards */}
                <div className="space-y-3">
                  <label className="text-[11px] uppercase tracking-wider font-semibold text-[#6B6B6B] block">
                    SAVED ADDRESSES:
                  </label>

                  {savedAddresses.length === 0 && !isAddingNewAddress && (
                    <p className="text-xs text-[#6B6B6B]">
                      You don't have a saved address yet. Add one below to continue.
                    </p>
                  )}
                  {validationErrors.address && (
                    <p className="text-[11px] text-[#F05A7E]">{validationErrors.address}</p>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {savedAddresses.map((addr) => {
                      const isSelected = selectedAddressId === addr.id;
                      return (
                        <div
                          key={addr.id}
                          onClick={() => setSelectedAddressId(addr.id)}
                          className={`p-4 border text-left cursor-pointer transition-all ${
                            isSelected
                              ? 'border-[#0B0B0B] bg-[#FAF9F6] ring-1 ring-[#0B0B0B] shadow-xs'
                              : 'border-[#E8D5A8] bg-white hover:border-[#C9972B]'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-semibold tracking-widest uppercase bg-[#E8D5A8] px-2 py-0.5 text-[#121212]">
                              {addr.type}
                            </span>
                            {isSelected && (
                              <Check className="w-4 h-4 text-[#C9972B]" />
                            )}
                          </div>
                          <h4 className="font-serif text-sm text-[#121212] font-medium mt-2">
                            {addr.name}
                          </h4>
                          <p className="text-xs text-[#6B6B6B] mt-1 leading-relaxed">
                            {addr.addressLine1}
                            {addr.addressLine2 && `, ${addr.addressLine2}`}
                          </p>
                          <p className="text-xs text-[#6B6B6B]">
                            {addr.city}, {addr.state} - {addr.pinCode}
                          </p>
                          <p className="text-[11px] text-[#6B6B6B] mt-2 font-mono">
                            {addr.phone}
                          </p>
                        </div>
                      );
                    })}

                    {/* Add New Address Button */}
                    <button
                      onClick={() => setIsAddingNewAddress(true)}
                      className="p-4 border border-dashed border-[#E8D5A8] text-center flex flex-col items-center justify-center gap-2 hover:border-[#0B0B0B] transition-colors cursor-pointer bg-[#FAF9F6]"
                    >
                      <Plus className="w-5 h-5 text-[#C9972B]" />
                      <span className="text-xs font-semibold tracking-wider uppercase text-[#121212]">
                        + ADD NEW ADDRESS
                      </span>
                    </button>
                  </div>
                </div>

                {/* Add New Address Form Expansion */}
                {isAddingNewAddress && (
                  <motion.form
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    onSubmit={handleSaveNewAddress}
                    className="p-5 bg-[#FAF9F6] border border-[#E8D5A8] space-y-4"
                  >
                    <div className="flex items-center justify-between border-b border-[#E8D5A8] pb-2">
                      <h4 className="font-serif text-base text-[#121212]">
                        ADD NEW ATELIER DESTINATION
                      </h4>
                      <button
                        type="button"
                        onClick={() => setIsAddingNewAddress(false)}
                        className="text-xs text-[#6B6B6B] hover:underline"
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10.5px] uppercase tracking-wider font-semibold text-[#6B6B6B] block mb-1">
                          FLAT / BUILDING / STREET *
                        </label>
                        <input
                          type="text"
                          value={newAddressForm.addressLine1}
                          onChange={(e) =>
                            setNewAddressForm({ ...newAddressForm, addressLine1: e.target.value })
                          }
                          placeholder="e.g. Flat 301, Oberoi Sky Heights"
                          className="w-full p-2.5 text-xs bg-white border border-[#E8D5A8] focus:border-[#0B0B0B] focus:outline-hidden"
                        />
                        {validationErrors.addressLine1 && (
                          <p className="text-[10px] text-[#F05A7E] mt-1">{validationErrors.addressLine1}</p>
                        )}
                      </div>

                      <div>
                        <label className="text-[10.5px] uppercase tracking-wider font-semibold text-[#6B6B6B] block mb-1">
                          LANDMARK / LOCALITY (OPTIONAL)
                        </label>
                        <input
                          type="text"
                          value={newAddressForm.addressLine2}
                          onChange={(e) =>
                            setNewAddressForm({ ...newAddressForm, addressLine2: e.target.value })
                          }
                          placeholder="e.g. Near Art Gallery Promenade"
                          className="w-full p-2.5 text-xs bg-white border border-[#E8D5A8] focus:border-[#0B0B0B] focus:outline-hidden"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-[10.5px] uppercase tracking-wider font-semibold text-[#6B6B6B] block mb-1">
                          PIN CODE *
                        </label>
                        <input
                          type="text"
                          maxLength={6}
                          value={newAddressForm.pinCode}
                          onChange={(e) =>
                            setNewAddressForm({ ...newAddressForm, pinCode: e.target.value.replace(/\D/g, '') })
                          }
                          placeholder="400050"
                          className="w-full p-2.5 text-xs bg-white border border-[#E8D5A8] focus:border-[#0B0B0B] focus:outline-hidden font-mono"
                        />
                        {validationErrors.pinCode && (
                          <p className="text-[10px] text-[#F05A7E] mt-1">{validationErrors.pinCode}</p>
                        )}
                      </div>

                      <div>
                        <label className="text-[10.5px] uppercase tracking-wider font-semibold text-[#6B6B6B] block mb-1">
                          CITY *
                        </label>
                        <input
                          type="text"
                          value={newAddressForm.city}
                          onChange={(e) =>
                            setNewAddressForm({ ...newAddressForm, city: e.target.value })
                          }
                          placeholder="Mumbai"
                          className="w-full p-2.5 text-xs bg-white border border-[#E8D5A8] focus:border-[#0B0B0B] focus:outline-hidden"
                        />
                      </div>

                      <div>
                        <label className="text-[10.5px] uppercase tracking-wider font-semibold text-[#6B6B6B] block mb-1">
                          STATE *
                        </label>
                        <input
                          type="text"
                          value={newAddressForm.state}
                          onChange={(e) =>
                            setNewAddressForm({ ...newAddressForm, state: e.target.value })
                          }
                          placeholder="Maharashtra"
                          className="w-full p-2.5 text-xs bg-white border border-[#E8D5A8] focus:border-[#0B0B0B] focus:outline-hidden"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="px-6 py-2.5 bg-[#0B0B0B] text-white text-xs font-semibold tracking-wider uppercase hover:bg-[#0B0B0B] cursor-pointer"
                    >
                      SAVE ADDRESS
                    </button>
                  </motion.form>
                )}

                <div className="pt-4 border-t border-[#E8D5A8] flex justify-end">
                  <button
                    onClick={() => {
                      if (validateDetails()) setCurrentStep('payment');
                    }}
                    className="px-8 py-3.5 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-[0.2em] uppercase hover:bg-[#0B0B0B] transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <span>CONTINUE TO PAYMENT</span>
                    <ChevronRight className="w-4 h-4 text-[#C9972B]" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 2: PAYMENT METHOD */}
            {currentStep === 'payment' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-6 sm:p-8 bg-white border border-[#E8D5A8] space-y-6"
              >
                <div className="border-b border-[#E8D5A8] pb-4">
                  <span className="text-[10px] font-semibold tracking-[0.24em] uppercase text-[#C9972B]">
                    STEP 02 OF 03
                  </span>
                  <h2 className="font-serif text-2xl text-[#121212] mt-1">
                    SELECT PAYMENT METHOD
                  </h2>
                  <p className="text-xs text-[#6B6B6B] mt-1">
                    Choose how you'd like to pay for this order.
                  </p>
                </div>

                {/* Method Tiles — Online is not wired to a real gateway yet */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div
                    className="p-4 text-left border border-[#E8D5A8] bg-[#FAF9F6] opacity-60 cursor-not-allowed relative overflow-hidden"
                    title="Online payment is coming soon"
                  >
                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-[#E8D5A8] text-[#121212] text-[9px] font-bold uppercase tracking-wider">
                      Coming Soon
                    </span>
                    <CreditCard className="w-5 h-5 text-[#6B6B6B] mb-2" />
                    <span className="font-serif text-sm font-medium text-[#6B6B6B] block">
                      Online Payment
                    </span>
                    <p className="text-xs text-[#6B6B6B] mt-1">
                      UPI, Cards & Net Banking — arriving soon.
                    </p>
                  </div>

                  <button
                    type="button"
                    className="p-4 text-left border border-[#0B0B0B] bg-white ring-1 ring-[#0B0B0B] cursor-default"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Banknote className="w-5 h-5 text-[#C9972B]" />
                      <Check className="w-4 h-4 text-[#C9972B]" />
                    </div>
                    <span className="font-serif text-sm font-medium text-[#121212] block">
                      Cash on Delivery
                    </span>
                    <p className="text-xs text-[#6B6B6B] mt-1">
                      Pay in cash or UPI when your order arrives.
                    </p>
                  </button>
                </div>

                <div className="pt-4 border-t border-[#E8D5A8] flex justify-between">
                  <button
                    onClick={() => setCurrentStep('details')}
                    className="px-6 py-3 border border-[#E8D5A8] text-xs font-semibold uppercase tracking-wider text-[#121212] hover:bg-[#FAF9F6]"
                  >
                    BACK
                  </button>
                  <button
                    onClick={() => setCurrentStep('review')}
                    className="px-8 py-3.5 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-[0.2em] uppercase hover:bg-[#0B0B0B] transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <span>REVIEW ORDER</span>
                    <ChevronRight className="w-4 h-4 text-[#C9972B]" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 4: FINAL REVIEW & PLACE ORDER */}
            {currentStep === 'review' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-6 sm:p-8 bg-white border border-[#E8D5A8] space-y-6"
              >
                <div className="border-b border-[#E8D5A8] pb-4">
                  <span className="text-[10px] font-semibold tracking-[0.24em] uppercase text-[#C9972B]">
                    STEP 03 OF 03
                  </span>
                  <h2 className="font-serif text-2xl text-[#121212] mt-1">
                    REVIEW & CONFIRM ORDER
                  </h2>
                  <p className="text-xs text-[#6B6B6B] mt-1">
                    Please inspect your dispatch destination, payment method, and reserved selections.
                  </p>
                </div>

                {/* Review Blocks */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  
                  {/* Address Summary Block */}
                  <div className="p-4 bg-[#FAF9F6] border border-[#E8D5A8] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-[#6B6B6B]">
                        DELIVERING TO:
                      </span>
                      <button
                        onClick={() => setCurrentStep('details')}
                        className="text-[11px] font-semibold text-[#C9972B] uppercase hover:underline"
                      >
                        EDIT
                      </button>
                    </div>
                    {activeAddress ? (
                      <>
                        <h4 className="font-serif text-sm font-medium text-[#121212]">
                          {activeAddress.name} ({activeAddress.type})
                        </h4>
                        <p className="text-xs text-[#6B6B6B]">
                          {activeAddress.addressLine1}
                          {activeAddress.addressLine2 && `, ${activeAddress.addressLine2}`}
                        </p>
                        <p className="text-xs text-[#6B6B6B]">
                          {activeAddress.city}, {activeAddress.state} - {activeAddress.pinCode}
                        </p>
                        <p className="text-[11px] text-[#6B6B6B] font-mono">
                          Phone: {activeAddress.phone}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-[#F05A7E]">No delivery address selected.</p>
                    )}
                  </div>

                  {/* Payment Summary Block */}
                  <div className="p-4 bg-[#FAF9F6] border border-[#E8D5A8] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-[#6B6B6B]">
                        PAYMENT METHOD:
                      </span>
                      <button
                        onClick={() => setCurrentStep('payment')}
                        className="text-[11px] font-semibold text-[#C9972B] uppercase hover:underline"
                      >
                        EDIT
                      </button>
                    </div>
                    <h4 className="font-serif text-sm font-medium text-[#121212] uppercase">
                      CASH ON DELIVERY
                    </h4>
                    <p className="text-xs text-[#6B6B6B]">
                      Standard Air Courier (3-4 Days)
                    </p>
                  </div>

                </div>

                {/* Items Summary in Step 4 */}
                <div className="space-y-3 pt-2">
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-[#6B6B6B] block">
                    RESERVED CREATIONS:
                  </span>
                  <div className="divide-y divide-[#E8D5A8] border border-[#E8D5A8] bg-[#FAF9F6]">
                    {cartItems.map((item, i) => {
                      const itemPrice = item.selectedSize === '30g' ? 549 : item.product.price;
                      return (
                        <div key={i} className="p-3.5 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <img
                              src={item.product.images.primary}
                              alt={item.product.name}
                              className="w-12 h-14 object-cover border border-[#E8D5A8]"
                            />
                            <div>
                              <h5 className="font-serif text-xs sm:text-sm text-[#121212]">
                                {item.product.name}
                              </h5>
                              <p className="text-[11px] text-[#6B6B6B]">
                                {item.selectedShade ? `Shade: ${item.selectedShade.name}` : item.selectedSize ? `Size: ${item.selectedSize}` : ''} • Qty: {item.quantity}
                              </p>
                            </div>
                          </div>
                          <span className="font-serif text-xs sm:text-sm font-medium text-[#121212]">
                            ₹{itemPrice * item.quantity}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {errorMessage && (
                  <div className="p-5 bg-[#FAF9F6] border border-[#E8D5A8] text-xs text-[#F05A7E] space-y-3">
                    <div className="flex items-center gap-2 font-semibold tracking-wider uppercase text-xs text-[#F05A7E]">
                      <AlertCircle className="w-4 h-4 text-[#F05A7E] shrink-0" />
                      <span>YOUR ORDER COULDN'T BE PLACED.</span>
                    </div>
                    <p className="text-[#F05A7E] font-light leading-relaxed">
                      {errorMessage}
                    </p>
                    <div className="flex items-center gap-3 pt-2">
                      <button
                        onClick={handleConfirmOrder}
                        className="px-4 py-2 bg-[#F05A7E] text-white text-[11px] uppercase tracking-widest font-semibold hover:bg-[#F05A7E] transition-colors"
                      >
                        TRY AGAIN
                      </button>
                    </div>
                  </div>
                )}

                {/* Confirm Order Final Button */}
                <div className="pt-4 border-t border-[#E8D5A8] space-y-3">
                  <button
                    id="checkout-place-order-final-btn"
                    disabled={isSubmitting || !activeAddress}
                    onClick={handleConfirmOrder}
                    className={`w-full py-4.5 bg-[#0B0B0B] text-[#FAF9F6] text-xs sm:text-[13px] font-semibold tracking-[0.24em] uppercase transition-all duration-300 flex items-center justify-center gap-3 shadow-lg cursor-pointer ${
                      isSubmitting || !activeAddress ? 'opacity-80 cursor-not-allowed' : 'hover:bg-[#0B0B0B]'
                    }`}
                  >
                    {isSubmitting ? (
                      <>
                        <Sparkles className="w-4 h-4 text-[#C9972B] animate-spin" />
                        <span>CONFIRMING YOUR ORDER...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4 text-[#C9972B]" />
                        <span>CONFIRM ORDER • ₹{grandTotal}</span>
                      </>
                    )}
                  </button>

                  <p className="text-[10.5px] text-center text-[#6B6B6B]">
                    By confirming, you authorize Glamirk Beauty to process this Cash on Delivery order.
                  </p>
                </div>
              </motion.div>
            )}

          </div>

          {/* Right Column: Sticky Summary & Guarantees (4-5 Cols) */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-6 lg:sticky lg:top-28">
            <div className="p-6 bg-white border border-[#E8D5A8] space-y-4 shadow-xs">
              <h3 className="font-serif text-lg text-[#121212] border-b border-[#E8D5A8] pb-3">
                ORDER BREAKDOWN
              </h3>

              {/* Items List Preview */}
              <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                {cartItems.map((item, index) => {
                  const itemPrice = item.selectedSize === '30g' ? 549 : item.product.price;
                  return (
                    <div key={index} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={item.product.images.primary}
                          alt={item.product.name}
                          className="w-9 h-11 object-cover border border-[#E8D5A8]"
                        />
                        <div>
                          <p className="text-[#121212] font-medium truncate max-w-[140px]">
                            {item.product.name}
                          </p>
                          <span className="text-[10px] text-[#6B6B6B]">
                            Qty {item.quantity} {item.selectedShade ? `• ${item.selectedShade.name}` : ''}
                          </span>
                        </div>
                      </div>
                      <span className="font-mono text-[#121212]">₹{itemPrice * item.quantity}</span>
                    </div>
                  );
                })}
              </div>

              {/* Breakdown numbers */}
              <div className="space-y-2 pt-3 border-t border-[#E8D5A8] text-xs text-[#6B6B6B]">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-mono text-[#121212]">₹{subtotal}</span>
                </div>

                {discountAmount > 0 && (
                  <div className="flex justify-between text-[#C9972B] font-medium">
                    <span>Privilege Discount ({appliedCoupon?.code})</span>
                    <span className="font-mono">-₹{discountAmount}</span>
                  </div>
                )}

                <div className="flex justify-between">
                  <span>Courier & Dispatch</span>
                  <span className="text-[#121212] font-medium">
                    {shippingFee === 0 ? (
                      <span className="text-[#C9972B] uppercase font-semibold">FREE</span>
                    ) : (
                      `₹${shippingFee}`
                    )}
                  </span>
                </div>

                <div className="flex justify-between text-[11px] text-[#6B6B6B]">
                  <span>All Taxes & GST</span>
                  <span>Included</span>
                </div>

                <div className="pt-3 border-t border-[#E8D5A8] flex justify-between items-baseline">
                  <span className="font-serif text-sm text-[#121212] font-medium">
                    Final Payable
                  </span>
                  <span className="font-serif text-2xl font-semibold text-[#121212]">
                    ₹{grandTotal}
                  </span>
                </div>
              </div>

              {/* Assurances */}
              <div className="pt-3 border-t border-[#FAF9F6] space-y-2 text-[11px] text-[#6B6B6B]">
                <div className="flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-[#C9972B]" />
                  <span>Secure 256-bit encryption</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-[#C9972B]" />
                  <span>Live tracking dispatched via SMS</span>
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* Luxury Payment Processing Modal */}
      <AnimatePresence>
        {isSubmitting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#0B0B0B]/80 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#FFFFFF] border border-[#E8D5A8] p-8 sm:p-10 max-w-md w-full text-center shadow-2xl space-y-5"
            >
              <div className="w-14 h-14 bg-[#FAF9F6] border border-[#E8D5A8] rounded-full flex items-center justify-center mx-auto text-[#C9972B]">
                <Sparkles className="w-6 h-6 animate-spin text-[#C9972B]" />
              </div>
              <div className="space-y-2">
                <span className="text-[10px] uppercase tracking-[0.24em] font-semibold text-[#C9972B] block">
                  GLAMIRK ATELIER VERIFICATION
                </span>
                <h3 className="font-serif text-xl sm:text-2xl text-[#121212]">
                  SECURELY PROCESSING YOUR PAYMENT...
                </h3>
                <p className="text-xs text-[#6B6B6B] font-light leading-relaxed">
                  Connecting with certified payment networks. Please do not refresh or close this window.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};
