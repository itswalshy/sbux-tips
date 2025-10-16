import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import { PartnerPayout } from "@shared/schema";

const DENOMINATIONS = [20, 10, 5, 1] as const;
type Denomination = typeof DENOMINATIONS[number];

type BillBreakdownModalProps = {
  isOpen: boolean;
  onClose: () => void;
  partner: PartnerPayout;
  onSave: (breakdown: PartnerPayout["billBreakdown"]) => void;
};

type BillCounts = Record<Denomination, number>;

function buildInitialCounts(breakdown: PartnerPayout["billBreakdown"]): BillCounts {
  const counts: BillCounts = {
    20: 0,
    10: 0,
    5: 0,
    1: 0,
  };

  breakdown.forEach((bill) => {
    if (DENOMINATIONS.includes(bill.denomination as Denomination)) {
      counts[bill.denomination as Denomination] = bill.quantity;
    }
  });

  return counts;
}

export default function BillBreakdownModal({
  isOpen,
  onClose,
  partner,
  onSave,
}: BillBreakdownModalProps) {
  const [billCounts, setBillCounts] = useState<BillCounts>(() => buildInitialCounts(partner.billBreakdown));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setBillCounts(buildInitialCounts(partner.billBreakdown));
      setErrorMessage(null);
    }
  }, [isOpen, partner.billBreakdown]);

  const totalFromBills = useMemo(() => {
    return DENOMINATIONS.reduce((sum, denom) => sum + denom * (billCounts[denom] ?? 0), 0);
  }, [billCounts]);

  const amountMatches = totalFromBills === partner.rounded;
  const difference = partner.rounded - totalFromBills;

  const updateCount = (denom: Denomination, value: string) => {
    const parsed = parseInt(value, 10);

    setBillCounts((prev) => ({
      ...prev,
      [denom]: isNaN(parsed) || parsed < 0 ? 0 : parsed,
    }));
  };

  const handleSave = () => {
    if (!amountMatches) {
      setErrorMessage(
        `Bill total (${formatCurrency(totalFromBills)}) must equal the rounded payout (${formatCurrency(partner.rounded)}).`
      );
      return;
    }

    const breakdown = DENOMINATIONS.map((denom) => ({
      denomination: denom,
      quantity: billCounts[denom] ?? 0,
    })).filter((entry) => entry.quantity > 0);

    onSave(breakdown);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md bg-[#3a5c5c] border border-[#4c6767] text-[#f5f5f5]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[#f5f5f5]">
            Adjust Bill Breakdown
          </DialogTitle>
          <DialogDescription className="text-[#bfbfbf]">
            Ensure the bills add up to {formatCurrency(partner.rounded)} for {partner.name}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {DENOMINATIONS.map((denom) => (
            <div key={denom} className="flex items-center justify-between bg-[#364949] rounded-md px-3 py-2">
              <label htmlFor={`bill-${denom}`} className="text-sm font-medium text-[#ffeed6]">
                ${denom} bills
              </label>
              <input
                id={`bill-${denom}`}
                type="number"
                min={0}
                inputMode="numeric"
                value={billCounts[denom] ?? 0}
                onChange={(e) => updateCount(denom, e.target.value)}
                className="w-20 bg-[#1E3535] border border-[#4c6767] rounded-md text-right text-[#f5f5f5] px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#93ec93]"
              />
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-md bg-[#1E3535] px-3 py-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-[#9fd6e9]">Total from bills</span>
            <span className={`font-semibold ${amountMatches ? "text-[#93ec93]" : "text-[#dd7895]"}`}>
              {formatCurrency(totalFromBills)}
            </span>
          </div>
          {!amountMatches && (
            <p className="text-xs text-[#ffeed6] mt-2">
              {difference > 0 ? `You still need ${formatCurrency(difference)}.` : `You have ${formatCurrency(Math.abs(difference))} too much.`}
            </p>
          )}
        </div>

        {errorMessage && (
          <div className="mt-3 text-sm text-[#dd7895] bg-[#422f36] border border-[#dd7895]/40 rounded-md px-3 py-2">
            {errorMessage}
          </div>
        )}

        <DialogFooter>
          <button
            className="btn btn-transparent mr-2"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
          >
            Save Breakdown
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
