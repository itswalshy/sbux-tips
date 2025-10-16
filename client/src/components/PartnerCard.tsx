import { useEffect, useMemo, useState } from "react";
import { PartnerPayout } from "@shared/schema";
import { PencilIcon, RotateCcwIcon, SaveIcon, XIcon } from "lucide-react";

type PartnerCardProps = {
  partner: PartnerPayout;
  hourlyRate: number;
  onBillBreakdownChange: (billBreakdown: Array<{ denomination: number; quantity: number }>) => void;
  onResetBillBreakdown: () => Array<{ denomination: number; quantity: number }> | void;
};

// Get a CSS class based on denomination
const getBillClass = (denomination: number): string => {
  switch(denomination) {
    case 20: return "bg-[#d2b0e3] text-[#364949]"; // Purple for $20
    case 10: return "bg-[#dd7895] text-[#364949]"; // Pink for $10
    case 5: return "bg-[#ffd1ba] text-[#364949]";  // Orange for $5
    case 1: return "bg-[#ffeed6] text-[#364949]";  // Yellow for $1
    default: return "bg-[#93ec93] text-[#364949]"; // Green fallback
  }
};

const BILL_DENOMINATIONS = [20, 10, 5, 1] as const;

export default function PartnerCard({ partner, hourlyRate, onBillBreakdownChange, onResetBillBreakdown }: PartnerCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [billInputs, setBillInputs] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  const initializeInputs = () => {
    const inputState: Record<number, string> = {};
    BILL_DENOMINATIONS.forEach((denomination) => {
      const bill = partner.billBreakdown.find((item) => item.denomination === denomination);
      inputState[denomination] = bill ? bill.quantity.toString() : "0";
    });
    return inputState;
  };

  useEffect(() => {
    setBillInputs(initializeInputs());
  }, [partner.billBreakdown]);

  const totalFromInputs = useMemo(() => {
    return BILL_DENOMINATIONS.reduce((sum, denomination) => {
      const quantity = parseInt(billInputs[denomination] ?? "0", 10);
      if (isNaN(quantity)) {
        return sum;
      }
      return sum + denomination * quantity;
    }, 0);
  }, [billInputs]);

  useEffect(() => {
    if (!isEditing) {
      setError(null);
      return;
    }

    if (totalFromInputs === partner.rounded) {
      setError(null);
    } else {
      const difference = partner.rounded - totalFromInputs;
      const sign = difference >= 0 ? "add" : "remove";
      setError(`Please ${sign} ${Math.abs(difference)} dollars to match the $${partner.rounded} payout.`);
    }
  }, [isEditing, totalFromInputs, partner.rounded]);

  const handleInputChange = (denomination: number, value: string) => {
    if (value === "" || /^\d+$/.test(value)) {
      setBillInputs((prev) => ({
        ...prev,
        [denomination]: value === "" ? "0" : value,
      }));
    }
  };

  const handleStartEditing = () => {
    setBillInputs(initializeInputs());
    setIsEditing(true);
  };

  const handleCancelEditing = () => {
    setBillInputs(initializeInputs());
    setError(null);
    setIsEditing(false);
  };

  const handleSave = () => {
    const newBreakdown = BILL_DENOMINATIONS.map((denomination) => ({
      denomination,
      quantity: parseInt(billInputs[denomination] ?? "0", 10) || 0,
    })).filter((bill) => bill.quantity > 0);

    if (totalFromInputs !== partner.rounded) {
      setError(`Bill total must equal $${partner.rounded}. Currently at $${totalFromInputs}.`);
      return;
    }

    onBillBreakdownChange(newBreakdown);
    setIsEditing(false);
    setError(null);
  };

  const handleReset = () => {
    const recalculated = onResetBillBreakdown();

    if (Array.isArray(recalculated) && recalculated.length) {
      const recalculatedState: Record<number, string> = {};
      BILL_DENOMINATIONS.forEach((denomination) => {
        const bill = recalculated.find((item) => item.denomination === denomination);
        recalculatedState[denomination] = bill ? bill.quantity.toString() : "0";
      });
      setBillInputs(recalculatedState);
    } else {
      setBillInputs(initializeInputs());
    }

    setError(null);
    setIsEditing(false);
  };

  return (
    <div className="card animate-fadeUp overflow-hidden shadow-soft gradient-border">
      <div className="card-header flex flex-row justify-between items-center py-3">
        <div className="flex items-center">
          <div className="w-8 h-8 bg-[#364949] rounded-full flex items-center justify-center mr-3 border-2 border-[#93ec93]">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-[#93ec93]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h3 className="font-medium text-lg text-[#f5f5f5] m-0 truncate pr-2">{partner.name}</h3>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-xs text-[#ffeed6]">Payout</span>
          <span className="text-2xl font-bold text-[#dd7895] whitespace-nowrap animate-pulse">${partner.rounded}</span>
        </div>
      </div>

      <div className="card-body p-4">
        <div className="flex justify-between items-center mb-3 bg-[#364949] rounded-md p-2">
          <div className="flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-[#9fd6e9]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium text-[#ffeed6]">Hours:</span>
          </div>
          <span className="bg-[#1E3535] px-3 py-1 rounded-full text-[#f5f5f5] text-sm font-medium">{partner.hours}</span>
        </div>
        
        <div className="bg-[#1E3535] rounded-md p-3 mb-2">
          <div className="text-xs mb-1 text-[#9fd6e9]">Calculation</div>
          <div className="text-sm flex flex-wrap items-center text-[#f5f5f5] break-words">
            <span className="mr-1 font-medium">{partner.hours}</span>
            <span className="text-[#ffeed6] mx-1">×</span>
            <span className="mx-1 text-[#9fd6e9] font-medium">${(Math.floor(hourlyRate * 100) / 100).toFixed(2)}</span>
            <span className="text-[#ffeed6] mx-1">=</span>
            <span className="mx-1 text-[#ffeed6] font-medium">${(partner.hours * hourlyRate).toFixed(2)}</span>
            <span className="text-[#ffeed6] mx-1">→</span>
            <span className="ml-1 font-bold text-[#dd7895]">${partner.rounded}</span>
          </div>
        </div>
      </div>

      <div className="card-footer p-3">
        <div className="w-full">
          <div className="mb-2 text-sm font-medium text-[#ffeed6] flex items-center justify-between">
            <div className="flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Bill Breakdown:
            </div>
            {!isEditing ? (
              <button
                className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#364949] hover:bg-[#3f5b5b] text-[#ffeed6] transition-colors"
                onClick={handleStartEditing}
              >
                <PencilIcon className="w-3 h-3" />
                Edit bills
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#364949] hover:bg-[#3f5b5b] text-[#ffeed6] transition-colors"
                  onClick={handleSave}
                  disabled={totalFromInputs !== partner.rounded}
                >
                  <SaveIcon className="w-3 h-3" />
                  Save
                </button>
                <button
                  className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#364949] hover:bg-[#3f5b5b] text-[#ffeed6] transition-colors"
                  onClick={handleCancelEditing}
                >
                  <XIcon className="w-3 h-3" />
                  Cancel
                </button>
                <button
                  className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#364949] hover:bg-[#3f5b5b] text-[#ffeed6] transition-colors"
                  onClick={handleReset}
                  title="Revert to the automatic bill breakdown"
                >
                  <RotateCcwIcon className="w-3 h-3" />
                  Reset
                </button>
              </div>
            )}
          </div>

          {!isEditing && (
            <div className="flex flex-wrap gap-2">
              {[...partner.billBreakdown]
                .sort((a, b) => b.denomination - a.denomination)
                .map((bill, index) => {
                  const billClass = getBillClass(bill.denomination);
                  return (
                    <div
                      key={index}
                      className={`px-3 py-1 rounded-full text-sm font-medium shadow-sm transition-all hover:shadow-md hover:scale-105 ${billClass}`}
                    >
                      {bill.quantity}×${bill.denomination}
                    </div>
                  );
                })}
            </div>
          )}

          {isEditing && (
            <div className="bg-[#1E3535] rounded-md p-3 mt-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {BILL_DENOMINATIONS.map((denomination) => {
                  const billClass = getBillClass(denomination);
                  return (
                    <div key={denomination} className="flex flex-col">
                      <label className="text-xs text-[#9fd6e9] mb-1" htmlFor={`bill-${partner.name}-${denomination}`}>
                        ${denomination} bills
                      </label>
                      <input
                        id={`bill-${partner.name}-${denomination}`}
                        type="number"
                        min={0}
                        value={billInputs[denomination] ?? "0"}
                        onChange={(event) => handleInputChange(denomination, event.target.value)}
                        className={`h-10 rounded-md px-2 text-sm bg-[#243535] border border-[#4c6767] text-[#f5f5f5] focus:outline-none focus:ring-2 focus:ring-[#93ec93] ${billClass}`}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 text-xs text-[#ffeed6] flex flex-wrap items-center gap-2">
                <span>Bill total:</span>
                <span className="font-semibold text-[#93ec93]">${totalFromInputs}</span>
                <span className="opacity-60">/</span>
                <span className="font-semibold text-[#dd7895]">${partner.rounded}</span>
              </div>

              {error && (
                <div className="mt-2 text-xs text-red-400 bg-red-900/30 border border-red-500/40 rounded-md px-2 py-1">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
