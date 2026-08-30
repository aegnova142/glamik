import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  User,
  Heart,
  Sparkles,
  ShoppingBag,
  Clock,
  Package,
  RotateCcw,
  Check,
  ChevronRight,
  ShieldCheck,
  Truck,
  MapPin,
  Award,
  Share2,
  Star,
  Plus,
  Trash2,
  Headphones,
  HelpCircle,
  Camera,
  X,
  Copy,
  CheckCheck,
  LogIn,
  LogOut,
  KeyRound,
  Shield,
} from 'lucide-react';
import {
  BeautyProfile,
  Product,
  Shade,
  Order,
  Address,
  LoyaltyAccount,
  Review,
  ReturnRequest,
} from '../../types';
import { GLAMIRK_PRODUCTS } from '../../data/products';
import { getPaymentMethodLabel, getPaymentStatusLabel } from '../../utils/paymentDisplay';
import {
  DEFAULT_LOYALTY,
  SUPPORT_FAQS,
} from '../../data/commerce';
import { AuthModal } from './AuthModal';
import { useCustomerAuth } from '../../context/CustomerAuthContext';

interface MyGlamDashboardProps {
  profile: BeautyProfile | null;
  wishlist: string[];
  recentlyViewedIds: string[];
  orders?: Order[];
  savedAddresses?: Address[];
  reviews?: Review[];
  returnRequests?: ReturnRequest[];
  onAddNewAddress?: (address: Address) => void;
  onDeleteAddress?: (addressId: string) => void;
  onEditAddress?: (addressId: string, address: Omit<Address, 'id'>) => Promise<{ success: boolean; error?: string }>;
  onSetDefaultAddress?: (addressId: string) => void;
  onOpenShadeFinder: () => void;
  onOpenTryOn: (product: Product, shade?: Shade) => void;
  onAddToBag: (product: Product, shade?: Shade, size?: string, quantity?: number) => void;
  onToggleWishlist: (productId: string) => void;
  onSelectProduct: (product: Product) => void;
  onExploreShop: () => void;
  onTrackOrder?: (orderId: string) => void;
  onViewOrderDetail?: (orderId: string) => void;
  onOpenSupport?: () => void;
  onNavigateAdmin?: () => void;
  onSubmitReview: (productId: string, rating: number, title: string, comment: string) => Promise<{ success: boolean; error?: string }>;
  onSubmitReturn: (orderId: string, productId: string, reason: string, comment?: string) => Promise<{ success: boolean; error?: string }>;
}

type TabType =
  | 'PROFILE'
  | 'ORDERS'
  | 'SHADES'
  | 'WISHLIST'
  | 'ADDRESSES'
  | 'PRIVE'
  | 'REFERRALS'
  | 'REVIEWS'
  | 'RETURNS'
  | 'SUPPORT';

export const MyGlamDashboard: React.FC<MyGlamDashboardProps> = ({
  profile,
  wishlist,
  recentlyViewedIds,
  orders = [],
  savedAddresses = [],
  reviews = [],
  returnRequests = [],
  onAddNewAddress,
  onDeleteAddress,
  onEditAddress,
  onSetDefaultAddress,
  onOpenShadeFinder,
  onOpenTryOn,
  onAddToBag,
  onToggleWishlist,
  onSelectProduct,
  onExploreShop,
  onTrackOrder,
  onViewOrderDetail,
  onOpenSupport,
  onNavigateAdmin,
  onSubmitReview,
  onSubmitReturn,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('PROFILE');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'ALL' | 'ACTIVE' | 'DELIVERED' | 'CANCELLED' | 'RETURNED'>('ALL');
  const [loyalty, setLoyalty] = useState<LoyaltyAccount>(DEFAULT_LOYALTY);

  // Authentication Modal State — real identity comes from CustomerAuthContext (Postgres-backed)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const { customerUser, customerLogout } = useCustomerAuth();
  const currentUser = customerUser
    ? { name: customerUser.name, email: customerUser.email, phone: customerUser.phone || '' }
    : null;

  // Orders/Addresses are server-persisted for the signed-in customer — the
  // props passed down are already the source of truth, kept in sync here only
  // for local UI mutations (e.g. optimistic return requests).
  const userAddresses = savedAddresses;
  const userOrders = orders;

  const ORDER_STATUS_TABS: { id: typeof orderStatusFilter; label: string }[] = [
    { id: 'ALL', label: 'All' },
    { id: 'ACTIVE', label: 'Active' },
    { id: 'DELIVERED', label: 'Delivered' },
    { id: 'CANCELLED', label: 'Cancelled' },
    { id: 'RETURNED', label: 'Returned' },
  ];
  const filteredOrders = userOrders.filter((order) => {
    switch (orderStatusFilter) {
      case 'ALL':
        return true;
      case 'DELIVERED':
        return order.status === 'DELIVERED';
      case 'CANCELLED':
        return order.status === 'CANCELLED';
      case 'RETURNED':
        return order.status === 'RETURN_REQUESTED';
      case 'ACTIVE':
      default:
        return !['DELIVERED', 'CANCELLED', 'RETURN_REQUESTED'].includes(order.status);
    }
  });

  // Referral Copy feedback
  const [copiedReferral, setCopiedReferral] = useState(false);

  // Address Modal State
  const [isAddAddressOpen, setIsAddAddressOpen] = useState(false);
  const emptyAddressForm: Omit<Address, 'id'> = {
    name: currentUser?.name || '',
    type: 'Home',
    phone: currentUser?.phone || '',
    email: currentUser?.email || '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    pinCode: '',
    isDefault: false,
  };
  const [newAddress, setNewAddress] = useState<Omit<Address, 'id'>>(emptyAddressForm);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [addressFormError, setAddressFormError] = useState<string | null>(null);

  // Review Modal State
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [selectedProductForReview, setSelectedProductForReview] = useState<Product>(GLAMIRK_PRODUCTS[0]);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [reviewShadeFeedback, setReviewShadeFeedback] = useState('');
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Return Modal State
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [selectedOrderForReturn, setSelectedOrderForReturn] = useState<Order | undefined>(userOrders[0]);
  const [returnReason, setReturnReason] = useState('Damaged in transit');
  const [returnComments, setReturnComments] = useState('');
  const [returnError, setReturnError] = useState<string | null>(null);
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);

  const wishlistedProducts = GLAMIRK_PRODUCTS.filter((p) => wishlist.includes(p.id));
  const recentProducts = GLAMIRK_PRODUCTS.filter((p) => recentlyViewedIds.includes(p.id));
  const lipstick = GLAMIRK_PRODUCTS.find((p) => p.id === 'matte-liquid-lipstick-collection') || GLAMIRK_PRODUCTS[0];

  const handleCopyReferral = () => {
    navigator.clipboard?.writeText(`https://glamirk.com/invite/${loyalty.referralCode}`);
    setCopiedReferral(true);
    setTimeout(() => setCopiedReferral(false), 2500);
  };

  const handleCreateAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddressFormError(null);
    if (!newAddress.name.trim() || !newAddress.phone.trim() || !newAddress.addressLine1.trim() || !newAddress.city.trim() || !newAddress.state.trim() || !newAddress.pinCode.trim()) {
      setAddressFormError('Please fill in all required fields.');
      return;
    }

    if (editingAddressId) {
      const res = await onEditAddress?.(editingAddressId, newAddress);
      if (res && !res.success) {
        setAddressFormError(res.error || 'Could not update this address.');
        return;
      }
    } else {
      onAddNewAddress?.({ ...newAddress, id: `addr-${Date.now()}` });
    }

    setIsAddAddressOpen(false);
    setEditingAddressId(null);
    setNewAddress(emptyAddressForm);
  };

  const handleDeleteAddress = (id: string) => {
    onDeleteAddress?.(id);
  };

  const handleOpenEditAddress = (addr: Address) => {
    const { id, ...rest } = addr;
    setNewAddress(rest);
    setEditingAddressId(id);
    setAddressFormError(null);
    setIsAddAddressOpen(true);
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewComment.trim()) return;

    setIsSubmittingReview(true);
    setReviewError(null);
    const res = await onSubmitReview(selectedProductForReview.id, reviewRating, reviewTitle, reviewComment);
    setIsSubmittingReview(false);

    if (!res.success) {
      setReviewError(res.error || 'Could not submit your review. Please try again.');
      return;
    }

    setIsReviewModalOpen(false);
    setReviewComment('');
    setReviewTitle('');

    // Reward points for review (loyalty program remains a local demo — not
    // part of the server-persisted review itself)
    setLoyalty((prev) => ({
      ...prev,
      points: prev.points + 50,
      history: [
        {
          id: `rew-${Date.now()}`,
          date: 'Today',
          description: `Verified Review on ${selectedProductForReview.name}`,
          points: 50,
          type: 'earn',
        },
        ...prev.history,
      ],
    }));
  };

  const handleSubmitReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForReturn) return;
    const itemToReturn = selectedOrderForReturn.items[0];

    setIsSubmittingReturn(true);
    setReturnError(null);
    const res = await onSubmitReturn(selectedOrderForReturn.id, itemToReturn.productId, returnReason, returnComments);
    setIsSubmittingReturn(false);

    if (!res.success) {
      setReturnError(res.error || 'Could not submit your return request. Please try again.');
      return;
    }

    setIsReturnModalOpen(false);
    setReturnComments('');
  };

  return (
    <div className="bg-[#FAF9F6] min-h-screen text-[#121212] py-10 sm:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        
        {/* Header Strip */}
        <div className="border-b border-[#E8D5A8] pb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#FAF9F6] border border-[#E8D5A8] text-[10px] font-semibold tracking-[0.24em] uppercase text-[#C9972B]">
                <Sparkles className="w-3 h-3" />
                <span>PRIVATE BEAUTY SUITE • {loyalty.tier} TIER</span>
              </div>
              {currentUser ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#E8D5A8]/20 border border-[#E8D5A8]/50 text-[10px] font-mono text-[#121212] rounded-full">
                  <User className="w-3 h-3 text-[#C9972B]" />
                  <span>Logged in: {currentUser.name}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#FCE8ED] border border-[#F05A7E]/30 text-[10px] font-semibold text-[#F05A7E] rounded-full">
                  <span>Guest Session</span>
                </span>
              )}
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl text-[#121212]">
              MY GLAM
            </h1>
            <p className="text-xs sm:text-sm text-[#6B6B6B] font-light max-w-lg">
              Your personalized consultation profile, orders, saved shades, Privé loyalty rewards, and addresses.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Customer Sign In / Sign Out Button */}
            <button
              onClick={() => {
                if (currentUser) {
                  customerLogout();
                } else {
                  setIsAuthModalOpen(true);
                }
              }}
              className="px-4 py-3 bg-[#FAF9F6] border border-[#C9972B] text-[#121212] text-xs font-semibold tracking-wider uppercase hover:bg-[#C9972B] hover:text-[#0B0B0B] transition-all flex items-center gap-2 shadow-xs cursor-pointer"
              title={currentUser ? 'Sign Out' : 'Customer Login'}
            >
              <LogIn className="w-3.5 h-3.5 text-[#C9972B]" />
              <span>{currentUser ? 'SIGN OUT' : 'SIGN IN / LOGIN'}</span>
            </button>

            <button
              onClick={onOpenShadeFinder}
              className="px-4 py-3 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-[0.2em] uppercase hover:bg-[#0B0B0B] transition-colors flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#C9972B]" />
              <span>{profile ? 'RECALIBRATE' : 'SHADE QUIZ'}</span>
            </button>

            <button
              onClick={onExploreShop}
              className="px-4 py-3 border border-[#0B0B0B] text-[#121212] text-xs font-semibold tracking-wider uppercase hover:bg-[#0B0B0B] hover:text-white transition-colors cursor-pointer"
            >
              EXPLORE SHOP
            </button>
          </div>
        </div>

        {/* Dashboard Tabs Bar */}
        <div className="flex items-center gap-1 overflow-x-auto border-b border-[#E8D5A8] pb-px no-scrollbar">
          {[
            { id: 'PROFILE', label: 'My Profile', icon: User },
            { id: 'ORDERS', label: `My Orders (${userOrders.length})`, icon: Package },
            { id: 'SHADES', label: 'Saved Shades', icon: Sparkles },
            { id: 'WISHLIST', label: `Wishlist (${wishlist.length})`, icon: Heart },
            { id: 'ADDRESSES', label: 'Addresses', icon: MapPin },
            { id: 'PRIVE', label: `Glamirk Privé (${loyalty.points} pts)`, icon: Award },
            { id: 'REFERRALS', label: 'Share the Glam', icon: Share2 },
            { id: 'REVIEWS', label: 'Reviews', icon: Star },
            { id: 'RETURNS', label: 'Returns & Refunds', icon: RotateCcw },
            { id: 'SUPPORT', label: 'Support Concierge', icon: Headphones },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`px-4 py-3 text-xs font-semibold tracking-wider uppercase transition-all flex items-center gap-2 border-b-2 whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'border-[#0B0B0B] text-[#121212] bg-[#FAF9F6]/70'
                    : 'border-transparent text-[#6B6B6B] hover:text-[#121212] hover:bg-[#FAF9F6]'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#C9972B]' : ''}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: MY BEAUTY PROFILE */}
        {activeTab === 'PROFILE' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            {profile ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left: Calibrated Profile Summary */}
                <div className="lg:col-span-5 bg-white border border-[#E8D5A8] p-6 sm:p-8 space-y-6">
                  <div className="flex items-center justify-between border-b border-[#E8D5A8] pb-4">
                    <div>
                      <span className="text-[10px] font-semibold tracking-[0.24em] uppercase text-[#C9972B]">
                        COMPLEXION MATRIX
                      </span>
                      <h3 className="font-serif text-2xl text-[#121212]">
                        {profile.skinTone} Tone • {profile.undertone} Undertone
                      </h3>
                    </div>
                    <span className="w-3 h-3 rounded-full bg-[#C9972B]" title="Active calibrated" />
                  </div>

                  <div className="space-y-3.5 text-xs">
                    <div className="flex justify-between py-2 border-b border-[#FAF9F6]">
                      <span className="text-[#6B6B6B] uppercase">Skin Depth:</span>
                      <span className="font-medium text-[#121212]">{profile.skinTone} Complexion</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-[#FAF9F6]">
                      <span className="text-[#6B6B6B] uppercase">Undertone:</span>
                      <span className="font-medium text-[#121212]">{profile.undertone} Hue</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-[#FAF9F6]">
                      <span className="text-[#6B6B6B] uppercase">Signature Aesthetic:</span>
                      <span className="font-medium text-[#121212]">{profile.style} Glam</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-[#FAF9F6]">
                      <span className="text-[#6B6B6B] uppercase">Preferred Finish:</span>
                      <span className="font-medium text-[#121212]">{profile.finish} Texture</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-[#FAF9F6]">
                      <span className="text-[#6B6B6B] uppercase">Primary Occasion:</span>
                      <span className="font-medium text-[#121212]">{profile.occasion}</span>
                    </div>
                  </div>

                  <button
                    onClick={onOpenShadeFinder}
                    className="w-full py-3 bg-[#FAF9F6] border border-[#0B0B0B] text-[#121212] text-xs font-semibold tracking-wider uppercase hover:bg-[#0B0B0B] hover:text-white transition-colors cursor-pointer"
                  >
                    UPDATE MY COMPLEXION PROFILE
                  </button>
                </div>

                {/* Right: Curated Recommendations for Profile */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-serif text-xl text-[#121212]">
                      TAILORED FOR YOUR COMPLEXION
                    </h3>
                    <span className="text-xs text-[#C9972B] font-medium">
                      Calibrated for {profile.undertone} notes
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {GLAMIRK_PRODUCTS.map((prod) => (
                      <div
                        key={prod.id}
                        className="p-5 bg-white border border-[#E8D5A8] flex flex-col justify-between space-y-4 group"
                      >
                        <div
                          onClick={() => onSelectProduct(prod)}
                          className="aspect-[4/3] bg-[#FAF9F6] overflow-hidden cursor-pointer relative"
                        >
                          <img
                            src={prod.images.primary}
                            alt={prod.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        </div>

                        <div className="space-y-1">
                          <span className="text-[9.5px] uppercase tracking-wider text-[#6B6B6B]">
                            {prod.subCategory}
                          </span>
                          <h4
                            onClick={() => onSelectProduct(prod)}
                            className="font-serif text-base text-[#121212] hover:text-[#C9972B] cursor-pointer"
                          >
                            {prod.name}
                          </h4>
                          <span className="font-serif text-sm font-medium text-[#121212] block">
                            ₹{prod.price}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#FAF9F6]">
                          <button
                            onClick={() => onOpenTryOn(prod)}
                            className="py-2 text-[10.5px] font-semibold tracking-wider uppercase border border-[#E8D5A8] text-[#121212] hover:bg-[#FAF9F6]"
                          >
                            TRY ON
                          </button>
                          <button
                            onClick={() => onAddToBag(prod, prod.shades?.[0])}
                            className="py-2 text-[10.5px] font-semibold tracking-wider uppercase bg-[#0B0B0B] text-white hover:bg-[#0B0B0B]"
                          >
                            + ADD
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6 max-w-2xl mx-auto">
                {/* Account Sign In Access Box — only for guests; a logged-in
                    customer without a shade profile yet just needs the quiz
                    prompt below, not another "sign in" call to action. */}
                {!currentUser && (
                  <div className="p-8 sm:p-10 bg-gradient-to-br from-[#171717] via-[#171717] to-[#0B0B0B] border border-[#C9972B]/40 rounded-2xl text-[#FAF9F6] space-y-7 shadow-[0_20px_50px_rgba(201,151,43,0.12)]">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                      <div className="space-y-2">
                        <span className="inline-flex items-center gap-2 text-[10.5px] font-mono uppercase tracking-[0.24em] text-[#C9972B]">
                          <Sparkles className="w-3.5 h-3.5" />
                          GLAMIRK ATELIER ACCESS
                        </span>
                        <h3 className="font-serif text-2xl sm:text-3xl text-[#FAF9F6]">
                          Sign In to Unlock Your Glam Suite
                        </h3>
                        <p className="text-[#6B6B6B] text-xs sm:text-[13px] leading-relaxed max-w-md">
                          One account for everything Glamirk — track every order, revisit your shade quiz
                          results, manage saved addresses, and watch your Privé rewards grow with every purchase.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsAuthModalOpen(true)}
                        className="px-6 py-3.5 bg-gradient-to-r from-[#C9972B] to-[#E3B84B] hover:brightness-110 text-[#0B0B0B] text-xs font-bold uppercase tracking-wider rounded-full transition-all cursor-pointer shadow-[0_8px_20px_rgba(201,151,43,0.35)] flex items-center justify-center gap-2 shrink-0"
                      >
                        <User className="w-4 h-4" />
                        <span>Sign In / Create Account</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 pt-6 border-t border-[#E8D5A8]/15">
                      {[
                        { icon: Package, label: 'Order Tracking' },
                        { icon: Sparkles, label: 'Shade Quiz Matches' },
                        { icon: MapPin, label: 'Saved Addresses' },
                        { icon: Award, label: 'Privé Rewards' },
                      ].map((item) => (
                        <div key={item.label} className="flex flex-col items-center text-center gap-2">
                          <div className="w-10 h-10 rounded-full bg-[#C9972B]/10 border border-[#C9972B]/30 flex items-center justify-center text-[#E3B84B]">
                            <item.icon className="w-4 h-4" />
                          </div>
                          <span className="text-[10.5px] text-[#6B6B6B] leading-tight">{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="p-8 text-center bg-white border border-[#E8D5A8] rounded-xl space-y-4">
                  <Sparkles className="w-10 h-10 text-[#C9972B] mx-auto" />
                  <h3 className="font-serif text-2xl text-[#121212]">
                    DISCOVER YOUR BEAUTY PROFILE
                  </h3>
                  <p className="text-xs text-[#6B6B6B] leading-relaxed max-w-md mx-auto">
                    Calibrate your skin depth, warm or cool undertones, and finish preferences to receive bespoke shade matches.
                  </p>
                  <button
                    onClick={onOpenShadeFinder}
                    className="px-8 py-3.5 bg-[#0B0B0B] text-white text-xs font-semibold tracking-widest uppercase hover:bg-[#0B0B0B] cursor-pointer"
                  >
                    START 60-SEC CONSULTATION
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* TAB 2: MY ORDERS */}
        {activeTab === 'ORDERS' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl text-[#121212]">
                ORDER HISTORY & RECEIPTS
              </h2>
              <span className="text-xs text-[#6B6B6B]">
                {userOrders.length} Completed / In-Transit Orders
              </span>
            </div>

            <div className="flex flex-wrap gap-2 border-b border-[#E8D5A8] pb-3">
              {ORDER_STATUS_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setOrderStatusFilter(tab.id)}
                  className={`px-3.5 py-1.5 text-[11px] font-semibold tracking-wider uppercase cursor-pointer transition-colors ${
                    orderStatusFilter === tab.id
                      ? 'bg-[#0B0B0B] text-white'
                      : 'bg-[#FAF9F6] text-[#6B6B6B] border border-[#E8D5A8] hover:text-[#121212]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {filteredOrders.length === 0 && (
              <div className="p-10 text-center text-xs text-[#6B6B6B] bg-white border border-[#E8D5A8]">
                No orders in this category yet.
              </div>
            )}

            <div className="space-y-6">
              {filteredOrders.map((order) => (
                <div
                  key={order.id}
                  className="p-6 bg-white border border-[#E8D5A8] space-y-6 shadow-xs"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E8D5A8] pb-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="font-serif text-xl text-[#121212]">
                          #{order.orderNumber}
                        </span>
                        <span className="px-2.5 py-0.5 bg-[#0B0B0B] text-[#FAF9F6] text-[10px] font-semibold tracking-widest uppercase">
                          {order.status}
                        </span>
                      </div>
                      <p className="text-xs text-[#6B6B6B] mt-1">
                        Placed on {order.createdAt} • Delivery to {order.deliveryAddress.city}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => onViewOrderDetail?.(order.id)}
                        className="px-3.5 py-2 border border-[#0B0B0B] text-[#121212] text-xs font-semibold tracking-wider uppercase hover:bg-[#0B0B0B] hover:text-white transition-colors cursor-pointer"
                      >
                        VIEW DETAILS
                      </button>

                      <button
                        onClick={() => onTrackOrder?.(order.id)}
                        className="px-4 py-2 bg-[#0B0B0B] text-white text-xs font-semibold tracking-wider uppercase hover:bg-[#0B0B0B] flex items-center gap-1.5 cursor-pointer"
                      >
                        <Truck className="w-3.5 h-3.5 text-[#C9972B]" />
                        <span>TRACK SHIPMENT</span>
                      </button>

                      {order.status === 'DELIVERED' && (
                        <button
                          onClick={() => {
                            setSelectedOrderForReturn(order);
                            setReturnError(null);
                            setIsReturnModalOpen(true);
                          }}
                          className="px-3.5 py-2 border border-[#E8D5A8] text-xs font-semibold tracking-wider uppercase hover:bg-[#FAF9F6] text-[#6B6B6B] cursor-pointer"
                        >
                          RETURN / HELP
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Products */}
                  <div className="divide-y divide-[#FAF9F6]">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="py-3 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5">
                          <img
                            src={item.productImage}
                            alt={item.productName}
                            className="w-12 h-14 object-cover border border-[#E8D5A8]"
                          />
                          <div>
                            <h4 className="font-serif text-sm text-[#121212]">
                              {item.productName}
                            </h4>
                            <p className="text-xs text-[#6B6B6B]">
                              {item.shade ? `Shade: ${item.shade.name}` : item.size ? `Size: ${item.size}` : ''} • Qty: {item.quantity}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => {
                              const prod = GLAMIRK_PRODUCTS.find((p) => p.id === item.productId) || GLAMIRK_PRODUCTS[0];
                              onAddToBag(prod, item.shade, item.size);
                            }}
                            className="px-3 py-1.5 border border-[#0B0B0B] text-[#121212] text-[11px] font-semibold tracking-wider uppercase hover:bg-[#0B0B0B] hover:text-white transition-colors cursor-pointer"
                          >
                            BUY AGAIN
                          </button>

                          <button
                            onClick={() => {
                              const prod = GLAMIRK_PRODUCTS.find((p) => p.id === item.productId) || GLAMIRK_PRODUCTS[0];
                              setSelectedProductForReview(prod);
                              setIsReviewModalOpen(true);
                            }}
                            className="px-3 py-1.5 bg-[#FAF9F6] border border-[#E8D5A8] text-[#6B6B6B] text-[11px] font-semibold tracking-wider uppercase hover:text-[#121212] cursor-pointer flex items-center gap-1"
                          >
                            <Star className="w-3 h-3 text-[#C9972B]" />
                            <span>REVIEW</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Summary Total */}
                  <div className="pt-2 border-t border-[#FAF9F6] flex justify-between items-end text-xs text-[#6B6B6B]">
                    <div className="space-y-0.5">
                      <p>Payment Method: {getPaymentMethodLabel(order.payment.method)}</p>
                      <p>Payment Status: {getPaymentStatusLabel(order.payment.status)}</p>
                    </div>
                    <span className="font-serif text-sm font-semibold text-[#121212]">
                      Order Total: ₹{order.total}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* TAB 3: SAVED SHADES */}
        {activeTab === 'SHADES' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl text-[#121212]">
                YOUR SAVED SHADE MATCHES
              </h2>
              <button
                onClick={onOpenShadeFinder}
                className="text-xs font-semibold text-[#C9972B] uppercase hover:underline"
              >
                + FIND NEW MATCH
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {lipstick.shades?.slice(0, 3).map((shade) => (
                <div
                  key={shade.id}
                  className="p-6 bg-white border border-[#E8D5A8] space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-5 h-5 rounded-full border border-[#0B0B0B]/10 shadow-xs"
                          style={{ backgroundColor: shade.hex }}
                        />
                        <span className="font-serif text-base text-[#121212] font-medium">
                          {shade.name}
                        </span>
                      </div>
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-[#C9972B] bg-[#C9972B]/10 px-2 py-0.5">
                        {shade.undertone} MATCH
                      </span>
                    </div>

                    <p className="text-xs text-[#6B6B6B] leading-relaxed">
                      {shade.description}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-3 border-t border-[#FAF9F6]">
                    <button
                      onClick={() => onOpenTryOn(lipstick, shade)}
                      className="py-2 text-xs font-semibold tracking-wider uppercase border border-[#E8D5A8] text-[#121212] hover:bg-[#FAF9F6]"
                    >
                      TRY ON
                    </button>
                    <button
                      onClick={() => onAddToBag(lipstick, shade)}
                      className="py-2 text-xs font-semibold tracking-wider uppercase bg-[#0B0B0B] text-white hover:bg-[#0B0B0B]"
                    >
                      + ADD TO BAG
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* TAB 4: MY WISHLIST */}
        {activeTab === 'WISHLIST' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl text-[#121212]">
                YOUR BEAUTY EDIT ({wishlistedProducts.length})
              </h2>
            </div>

            {wishlistedProducts.length === 0 ? (
              <div className="p-12 text-center bg-white border border-[#E8D5A8] max-w-md mx-auto space-y-4">
                <Heart className="w-10 h-10 text-[#C9972B] mx-auto stroke-[1.2]" />
                <h3 className="font-serif text-xl text-[#121212]">
                  YOUR BEAUTY EDIT IS WAITING
                </h3>
                <p className="text-xs text-[#6B6B6B]">
                  Save your favorite lipstick shades, ceremonial sindoor, and skincare essentials.
                </p>
                <button
                  onClick={onExploreShop}
                  className="px-6 py-3 bg-[#0B0B0B] text-white text-xs font-semibold tracking-widest uppercase hover:bg-[#0B0B0B]"
                >
                  EXPLORE THE CATALOGUE
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {wishlistedProducts.map((prod) => (
                  <div
                    key={prod.id}
                    className="p-5 bg-white border border-[#E8D5A8] space-y-4 flex flex-col justify-between group"
                  >
                    <div
                      onClick={() => onSelectProduct(prod)}
                      className="aspect-square bg-[#FAF9F6] overflow-hidden cursor-pointer"
                    >
                      <img
                        src={prod.images.primary}
                        alt={prod.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <span className="text-[9.5px] uppercase tracking-wider text-[#6B6B6B]">
                        {prod.subCategory}
                      </span>
                      <h4
                        onClick={() => onSelectProduct(prod)}
                        className="font-serif text-base text-[#121212] hover:text-[#C9972B] cursor-pointer"
                      >
                        {prod.name}
                      </h4>
                      <span className="font-serif text-sm font-medium text-[#121212] block">
                        ₹{prod.price}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-3 border-t border-[#FAF9F6]">
                      <button
                        onClick={() => onAddToBag(prod, prod.shades?.[0])}
                        className="py-2.5 bg-[#0B0B0B] text-white text-xs font-semibold tracking-wider uppercase hover:bg-[#0B0B0B]"
                      >
                        ADD TO BAG
                      </button>
                      <button
                        onClick={() => onToggleWishlist(prod.id)}
                        className="py-2.5 border border-[#E8D5A8] text-xs font-semibold tracking-wider uppercase hover:text-[#F05A7E]"
                      >
                        REMOVE
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* TAB 5: MY ADDRESSES */}
        {activeTab === 'ADDRESSES' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl text-[#121212]">
                SAVED ATELIER DESTINATIONS
              </h2>
              <button
                onClick={() => {
                  setEditingAddressId(null);
                  setNewAddress(emptyAddressForm);
                  setAddressFormError(null);
                  setIsAddAddressOpen(true);
                }}
                className="px-4 py-2 bg-[#0B0B0B] text-white text-xs font-semibold tracking-wider uppercase hover:bg-[#0B0B0B] flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>ADD NEW ADDRESS</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {userAddresses.map((addr) => (
                <div
                  key={addr.id}
                  className="p-6 bg-white border border-[#E8D5A8] space-y-4 flex flex-col justify-between shadow-xs"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-widest font-semibold bg-[#E8D5A8] px-2 py-0.5 text-[#121212]">
                        {addr.type}
                      </span>
                      {addr.isDefault && (
                        <span className="text-[10px] text-[#C9972B] font-semibold uppercase">
                          DEFAULT
                        </span>
                      )}
                    </div>
                    <h4 className="font-serif text-base text-[#121212] font-medium">
                      {addr.name}
                    </h4>
                    <p className="text-xs text-[#6B6B6B] leading-relaxed">
                      {addr.addressLine1}
                      {addr.addressLine2 && `, ${addr.addressLine2}`}
                    </p>
                    <p className="text-xs text-[#6B6B6B]">
                      {addr.city}, {addr.state} - {addr.pinCode}
                    </p>
                    <p className="text-xs text-[#6B6B6B] font-mono pt-1">
                      {addr.phone}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-[#FAF9F6] flex items-center justify-between flex-wrap gap-2">
                    {!addr.isDefault && (
                      <button
                        onClick={() => onSetDefaultAddress?.(addr.id)}
                        className="text-xs text-[#C9972B] hover:underline uppercase tracking-wider font-semibold"
                      >
                        SET DEFAULT
                      </button>
                    )}
                    <div className="flex items-center gap-3 ml-auto">
                      <button
                        onClick={() => handleOpenEditAddress(addr)}
                        className="text-xs text-[#6B6B6B] hover:text-[#121212] uppercase tracking-wider font-semibold"
                      >
                        EDIT
                      </button>
                      <button
                        onClick={() => handleDeleteAddress(addr.id)}
                        className="text-xs text-[#6B6B6B] hover:text-[#F05A7E] flex items-center gap-1 uppercase tracking-wider font-semibold"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>DELETE</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* TAB 6: GLAMIRK PRIVÉ LOYALTY */}
        {activeTab === 'PRIVE' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            {/* Privé Hero Card */}
            <div className="bg-[#0B0B0B] text-[#FAF9F6] p-8 sm:p-12 border border-[#171717] relative overflow-hidden">
              <div className="max-w-2xl space-y-4 relative z-10">
                <span className="text-[10.5px] font-semibold tracking-[0.28em] uppercase text-[#C9972B]">
                  THE PRIVATE CLIENT PRIVILEGE
                </span>
                <h2 className="font-serif text-3xl sm:text-4xl text-white">
                  GLAMIRK PRIVÉ • {loyalty.tier}
                </h2>
                <p className="text-xs sm:text-sm text-[#E8D5A8] font-light leading-relaxed">
                  Earn points with each handcrafted formulation order, verified shade review, and intimate editorial recommendation.
                </p>

                <div className="pt-4 flex flex-wrap gap-8 items-baseline">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-[#C9972B] block">
                      PRIVÉ POINTS BALANCE
                    </span>
                    <span className="font-serif text-3xl text-[#C9972B] font-semibold">
                      {loyalty.points} PTS
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-[#C9972B] block">
                      NEXT PRIVILEGE TIER
                    </span>
                    <span className="font-serif text-xl text-white font-medium">
                      PRIVÉ BLACK (₹{5000 - loyalty.lifetimeSpend} more)
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Privé Benefits Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="p-6 bg-white border border-[#E8D5A8] space-y-2">
                <span className="text-[10px] uppercase font-semibold text-[#C9972B] tracking-widest">
                  BENEFIT 01
                </span>
                <h4 className="font-serif text-base text-[#121212]">
                  Complimentary Air Shipping
                </h4>
                <p className="text-xs text-[#6B6B6B]">
                  Zero minimum order threshold on all luxury orders with priority air courier.
                </p>
              </div>

              <div className="p-6 bg-white border border-[#E8D5A8] space-y-2">
                <span className="text-[10px] uppercase font-semibold text-[#C9972B] tracking-widest">
                  BENEFIT 02
                </span>
                <h4 className="font-serif text-base text-[#121212]">
                  Pre-Launch Atelier Access
                </h4>
                <p className="text-xs text-[#6B6B6B]">
                  48-hour exclusive reservation window before new shade drops & limited editions.
                </p>
              </div>

              <div className="p-6 bg-white border border-[#E8D5A8] space-y-2">
                <span className="text-[10px] uppercase font-semibold text-[#C9972B] tracking-widest">
                  BENEFIT 03
                </span>
                <h4 className="font-serif text-base text-[#121212]">
                  Bespoke Anniversary Gift
                </h4>
                <p className="text-xs text-[#6B6B6B]">
                  Complimentary Discovery Cleanser jar or full-size velvet lipstick on your birthday.
                </p>
              </div>
            </div>

            {/* Activity History */}
            <div className="bg-white border border-[#E8D5A8] p-6 space-y-4">
              <h3 className="font-serif text-lg text-[#121212]">
                POINTS ACCUMULATION HISTORY
              </h3>
              <div className="divide-y divide-[#FAF9F6]">
                {loyalty.history.map((h) => (
                  <div key={h.id} className="py-3 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-medium text-[#121212]">{h.description}</p>
                      <span className="text-[11px] text-[#6B6B6B]">{h.date}</span>
                    </div>
                    <span className="font-mono font-semibold text-[#C9972B]">
                      +{h.points} PTS
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* TAB 7: SHARE THE GLAM (REFERRAL) */}
        {activeTab === 'REFERRALS' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl mx-auto p-8 sm:p-10 bg-white border border-[#E8D5A8] text-center space-y-6 shadow-xs"
          >
            <div className="w-14 h-14 rounded-full bg-[#0B0B0B] text-[#C9972B] flex items-center justify-center mx-auto">
              <Share2 className="w-7 h-7 stroke-[1.5]" />
            </div>

            <div className="space-y-2">
              <span className="text-[10.5px] font-semibold tracking-[0.24em] uppercase text-[#C9972B]">
                SHARE THE GLAM
              </span>
              <h2 className="font-serif text-3xl text-[#121212]">
                Beauty is Better When Shared.
              </h2>
              <p className="text-xs sm:text-sm text-[#6B6B6B] font-light leading-relaxed">
                Gift your friends <strong>₹150 off</strong> their first Glamirk order, and receive <strong>200 Privé points</strong> credited to your suite upon their first checkout.
              </p>
            </div>

            {/* Referral Link Box */}
            <div className="p-4 bg-[#FAF9F6] border border-[#E8D5A8] flex items-center justify-between gap-3">
              <span className="font-mono text-xs font-semibold text-[#121212] truncate">
                https://glamirk.com/invite/{loyalty.referralCode}
              </span>
              <button
                onClick={handleCopyReferral}
                className="px-4 py-2 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-wider uppercase hover:bg-[#0B0B0B] flex items-center gap-1.5 flex-shrink-0 cursor-pointer"
              >
                {copiedReferral ? <CheckCheck className="w-3.5 h-3.5 text-[#C9972B]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedReferral ? 'COPIED' : 'COPY'}</span>
              </button>
            </div>
          </motion.div>
        )}

        {/* TAB 8: POST-PURCHASE REVIEWS */}
        {activeTab === 'REVIEWS' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase tracking-wider font-semibold text-[#C9972B]">
                  COMMUNITY EDITORIALS
                </span>
                <h2 className="font-serif text-2xl text-[#121212]">
                  HOW WAS YOUR GLAM?
                </h2>
              </div>

              <button
                onClick={() => setIsReviewModalOpen(true)}
                className="px-4 py-2.5 bg-[#0B0B0B] text-white text-xs font-semibold tracking-wider uppercase hover:bg-[#0B0B0B] flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>WRITE A REVIEW</span>
              </button>
            </div>

            <div className="space-y-4">
              {reviews.map((rev) => (
                <div
                  key={rev.id}
                  className="p-6 bg-white border border-[#E8D5A8] space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-1 text-[#C9972B] text-xs mb-1">
                        {[...Array(rev.rating)].map((_, i) => (
                          <Star key={i} className="w-3.5 h-3.5 fill-[#C9972B]" />
                        ))}
                      </div>
                      <h4 className="font-serif text-base text-[#121212]">
                        {rev.title}
                      </h4>
                      <p className="text-xs text-[#6B6B6B]">
                        {rev.productName} {rev.shadeName ? `• Shade: ${rev.shadeName}` : ''}
                      </p>
                    </div>

                    <span className="text-[10px] text-[#C9972B] bg-[#C9972B]/10 px-2 py-0.5 font-semibold uppercase">
                      VERIFIED PURCHASE
                    </span>
                  </div>

                  <p className="text-xs text-[#6B6B6B] leading-relaxed">
                    "{rev.comment}"
                  </p>

                  <div className="pt-2 border-t border-[#FAF9F6] flex justify-between text-[11px] text-[#6B6B6B]">
                    <span>By {rev.customerName} ({rev.skinTone || 'Warm Tone'})</span>
                    <span>{rev.date}</span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* TAB 9: RETURNS & REFUNDS */}
        {activeTab === 'RETURNS' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl text-[#121212]">
                RETURNS & EXCHANGE SUITE
              </h2>
              <button
                onClick={() => setIsReturnModalOpen(true)}
                className="px-4 py-2 bg-[#0B0B0B] text-white text-xs font-semibold tracking-wider uppercase hover:bg-[#0B0B0B]"
              >
                + NEW RETURN REQUEST
              </button>
            </div>

            <div className="p-4 bg-[#FAF9F6] border border-[#E8D5A8] text-xs text-[#6B6B6B] space-y-1">
              <p className="font-medium text-[#121212]">
                Glamirk Luxury Hygiene & Replacement Guarantee
              </p>
              <p>
                In the rare case of transit damage or wrong variant dispatch, complimentary doorstep reverse pickup and immediate replacements are provided within 7 days.
              </p>
            </div>

            <div className="space-y-4">
              {returnRequests.map((req) => (
                <div
                  key={req.id}
                  className="p-6 bg-white border border-[#E8D5A8] space-y-4 shadow-xs"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-serif text-lg text-[#121212]">
                        Order #{req.orderNumber}
                      </span>
                      <p className="text-xs text-[#6B6B6B]">
                        {req.productName} • Reason: {req.reason}
                      </p>
                    </div>

                    <span className="px-3 py-1 bg-[#C9972B]/10 text-[#C9972B] text-[11px] font-semibold tracking-wider uppercase">
                      STATUS: {req.status}
                    </span>
                  </div>

                  {req.comment && (
                    <p className="text-xs text-[#6B6B6B] bg-[#FAF9F6] p-3 border border-[#E8D5A8]">
                      Concierge Note: {req.comment}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* TAB 10: SUPPORT */}
        {activeTab === 'SUPPORT' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl text-[#121212]">
                CLIENT CONCIERGE & FREQUENT INQUIRIES
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {SUPPORT_FAQS.slice(0, 4).map((faq) => (
                <div key={faq.id} className="p-6 bg-white border border-[#E8D5A8] space-y-2">
                  <span className="text-[9.5px] uppercase font-semibold text-[#C9972B]">
                    {faq.category}
                  </span>
                  <h4 className="font-serif text-base text-[#121212]">
                    {faq.question}
                  </h4>
                  <p className="text-xs text-[#6B6B6B] leading-relaxed">
                    {faq.answer}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

      </div>

      {/* Review Modal */}
      <AnimatePresence>
        {isReviewModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0B0B0B]/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg bg-[#FAF9F6] border border-[#E8D5A8] p-6 sm:p-8 space-y-5 shadow-2xl relative"
            >
              <button
                onClick={() => setIsReviewModalOpen(false)}
                className="absolute top-5 right-5 text-[#6B6B6B] hover:text-[#121212]"
              >
                <X className="w-5 h-5" />
              </button>

              <div>
                <span className="text-[10px] font-semibold tracking-[0.24em] uppercase text-[#C9972B]">
                  COMMUNITY EDITORIAL
                </span>
                <h3 className="font-serif text-2xl text-[#121212] mt-0.5">
                  HOW WAS YOUR GLAM?
                </h3>
                <p className="text-xs text-[#6B6B6B]">
                  Reviewing: {selectedProductForReview.name}
                </p>
              </div>

              <form onSubmit={handleSubmitReview} className="space-y-4">
                <div>
                  <label className="text-[11px] uppercase tracking-wider font-semibold text-[#6B6B6B] block mb-1.5">
                    YOUR RATING
                  </label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setReviewRating(star)}
                        className="cursor-pointer"
                      >
                        <Star
                          className={`w-6 h-6 ${
                            star <= reviewRating ? 'fill-[#C9972B] text-[#C9972B]' : 'text-[#E8D5A8]'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] uppercase tracking-wider font-semibold text-[#6B6B6B] block mb-1">
                    HEADLINE / TITLE
                  </label>
                  <input
                    type="text"
                    value={reviewTitle}
                    onChange={(e) => setReviewTitle(e.target.value)}
                    placeholder="e.g. Flawless terracotta depth for warm undertones"
                    className="w-full p-2.5 text-xs bg-white border border-[#E8D5A8] focus:border-[#0B0B0B] focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-[11px] uppercase tracking-wider font-semibold text-[#6B6B6B] block mb-1">
                    WHAT DID YOU LOVE ABOUT THIS FORMULATION? *
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    placeholder="Describe the texture, longevity, hydration, and color saturation..."
                    className="w-full p-2.5 text-xs bg-white border border-[#E8D5A8] focus:border-[#0B0B0B] focus:outline-hidden"
                  />
                </div>

                {reviewError && <p className="text-xs text-red-600">{reviewError}</p>}

                <button
                  type="submit"
                  disabled={isSubmittingReview}
                  className="w-full py-3.5 bg-[#0B0B0B] text-white text-xs font-semibold tracking-widest uppercase hover:bg-[#0B0B0B] cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingReview ? 'SUBMITTING…' : 'SUBMIT REVIEW (+50 PTS)'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Return Request Modal */}
      <AnimatePresence>
        {isReturnModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0B0B0B]/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg bg-[#FAF9F6] border border-[#E8D5A8] p-6 sm:p-8 space-y-5 shadow-2xl relative"
            >
              <button
                onClick={() => setIsReturnModalOpen(false)}
                className="absolute top-5 right-5 text-[#6B6B6B] hover:text-[#121212]"
              >
                <X className="w-5 h-5" />
              </button>

              <div>
                <span className="text-[10px] font-semibold tracking-[0.24em] uppercase text-[#C9972B]">
                  CONCIERGE REPLACEMENT
                </span>
                <h3 className="font-serif text-2xl text-[#121212] mt-0.5">
                  REQUEST REPLACEMENT / RETURN
                </h3>
                <p className="text-xs text-[#6B6B6B]">
                  Order #{selectedOrderForReturn?.orderNumber}
                </p>
              </div>

              <form onSubmit={handleSubmitReturn} className="space-y-4">
                <div>
                  <label className="text-[11px] uppercase tracking-wider font-semibold text-[#6B6B6B] block mb-1">
                    PRIMARY REASON
                  </label>
                  <select
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    className="w-full p-2.5 text-xs bg-white border border-[#E8D5A8] focus:border-[#0B0B0B] focus:outline-hidden"
                  >
                    <option value="Damaged in transit">Damaged in transit / seal broken</option>
                    <option value="Incorrect shade variant received">Incorrect shade variant received</option>
                    <option value="Allergic sensitivity reported">Allergic sensitivity / formula inquiry</option>
                    <option value="Item defective or missing">Item defective or missing</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] uppercase tracking-wider font-semibold text-[#6B6B6B] block mb-1">
                    DETAILS / EXPLANATION
                  </label>
                  <textarea
                    rows={3}
                    value={returnComments}
                    onChange={(e) => setReturnComments(e.target.value)}
                    placeholder="Provide details for immediate resolution..."
                    className="w-full p-2.5 text-xs bg-white border border-[#E8D5A8] focus:border-[#0B0B0B] focus:outline-hidden"
                  />
                </div>

                {returnError && <p className="text-xs text-red-600">{returnError}</p>}

                <button
                  type="submit"
                  disabled={isSubmittingReturn}
                  className="w-full py-3.5 bg-[#0B0B0B] text-white text-xs font-semibold tracking-widest uppercase hover:bg-[#0B0B0B] cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingReturn ? 'SUBMITTING…' : 'SUBMIT CONCIERGE REQUEST'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Address Modal */}
      <AnimatePresence>
        {isAddAddressOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0B0B0B]/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg bg-[#FAF9F6] border border-[#E8D5A8] p-6 sm:p-8 space-y-5 shadow-2xl relative"
            >
              <button
                onClick={() => {
                  setIsAddAddressOpen(false);
                  setEditingAddressId(null);
                }}
                className="absolute top-5 right-5 text-[#6B6B6B] hover:text-[#121212]"
              >
                <X className="w-5 h-5" />
              </button>

              <div>
                <span className="text-[10px] font-semibold tracking-[0.24em] uppercase text-[#C9972B]">
                  ATELIER DESTINATION
                </span>
                <h3 className="font-serif text-2xl text-[#121212] mt-0.5">
                  {editingAddressId ? 'EDIT SHIPPING ADDRESS' : 'ADD NEW SHIPPING ADDRESS'}
                </h3>
              </div>

              <form onSubmit={handleCreateAddress} className="space-y-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10.5px] uppercase tracking-wider font-semibold text-[#6B6B6B] block mb-1">
                      RECIPIENT NAME *
                    </label>
                    <input
                      type="text"
                      required
                      value={newAddress.name}
                      onChange={(e) => setNewAddress({ ...newAddress, name: e.target.value })}
                      className="w-full p-2.5 text-xs bg-white border border-[#E8D5A8] focus:border-[#0B0B0B] focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="text-[10.5px] uppercase tracking-wider font-semibold text-[#6B6B6B] block mb-1">
                      PHONE NUMBER *
                    </label>
                    <input
                      type="tel"
                      required
                      value={newAddress.phone}
                      onChange={(e) => setNewAddress({ ...newAddress, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                      placeholder="9876543210"
                      className="w-full p-2.5 text-xs bg-white border border-[#E8D5A8] focus:border-[#0B0B0B] focus:outline-hidden font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10.5px] uppercase tracking-wider font-semibold text-[#6B6B6B] block mb-1">
                    ADDRESS TYPE
                  </label>
                  <select
                    value={newAddress.type}
                    onChange={(e) => setNewAddress({ ...newAddress, type: e.target.value as any })}
                    className="w-full p-2.5 text-xs bg-white border border-[#E8D5A8] focus:border-[#0B0B0B] focus:outline-hidden"
                  >
                    <option value="Home">Home</option>
                    <option value="Studio">Studio</option>
                    <option value="Work">Work</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10.5px] uppercase tracking-wider font-semibold text-[#6B6B6B] block mb-1">
                    STREET ADDRESS / RESIDENCE *
                  </label>
                  <input
                    type="text"
                    required
                    value={newAddress.addressLine1}
                    onChange={(e) => setNewAddress({ ...newAddress, addressLine1: e.target.value })}
                    placeholder="Flat 402, Signature Residences"
                    className="w-full p-2.5 text-xs bg-white border border-[#E8D5A8] focus:border-[#0B0B0B] focus:outline-hidden"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10.5px] uppercase tracking-wider font-semibold text-[#6B6B6B] block mb-1">
                      PIN CODE *
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      required
                      value={newAddress.pinCode}
                      onChange={(e) => setNewAddress({ ...newAddress, pinCode: e.target.value.replace(/\D/g, '') })}
                      placeholder="400050"
                      className="w-full p-2.5 text-xs bg-white border border-[#E8D5A8] focus:border-[#0B0B0B] focus:outline-hidden font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10.5px] uppercase tracking-wider font-semibold text-[#6B6B6B] block mb-1">
                      CITY *
                    </label>
                    <input
                      type="text"
                      required
                      value={newAddress.city}
                      onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })}
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
                      required
                      value={newAddress.state}
                      onChange={(e) => setNewAddress({ ...newAddress, state: e.target.value })}
                      placeholder="Maharashtra"
                      className="w-full p-2.5 text-xs bg-white border border-[#E8D5A8] focus:border-[#0B0B0B] focus:outline-hidden"
                    />
                  </div>
                </div>

                {addressFormError && <p className="text-xs text-red-600">{addressFormError}</p>}

                <button
                  type="submit"
                  className="w-full py-3 bg-[#0B0B0B] text-white text-xs font-semibold tracking-widest uppercase hover:bg-[#0B0B0B] cursor-pointer mt-2"
                >
                  {editingAddressId ? 'UPDATE ADDRESS' : 'SAVE ADDRESS'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global Authentication Modal (Customer) */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onCustomerLoginSuccess={() => {
          // CustomerAuthContext already updated on successful login/register — currentUser derives from it.
        }}
      />

    </div>
  );
};
