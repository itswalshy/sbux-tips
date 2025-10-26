import { BillInventory } from "@shared/schema";
import { calculateInventoryTotal } from "@/lib/billCalc";
import { useMemo } from "react";

const DENOMINATION_FIELDS = [
  { key: "twenties" as const, label: "$20 bills", value: 20 },
  { key: "tens" as const, label: "$10 bills", value: 10 },
  { key: "fives" as const, label: "$5 bills", value: 5 },
  { key: "ones" as const, label: "$1 bills", value: 1 },
];

type BillInventoryFormProps = {
  value: BillInventory;
  onChange: (value: BillInventory) => void;
  totalTipAmount: number | "";
};

export default function BillInventoryForm({ value, onChange, totalTipAmount }: BillInventoryFormProps) {
  const totals = useMemo(() => {
    const billTotal = calculateInventoryTotal(value);
    const matches = totalTipAmount === "" ? true : billTotal === Number(totalTipAmount);
    const difference = totalTipAmount === "" ? 0 : Number(totalTipAmount) - billTotal;

    return {
      billTotal,
      matches,
      difference,
    };
  }, [totalTipAmount, value]);

  const updateValue = (key: keyof BillInventory, amount: string) => {
    const parsed = parseInt(amount, 10);

    onChange({
      ...value,
      [key]: Number.isNaN(parsed) || parsed < 0 ? 0 : parsed,
    });
  };

  return (
    <div className="bg-[#2c4d4d] border border-[#3d6262] rounded-lg p-4 space-y-3 animate-fadeIn">
      <div>
        <h3 className="text-sm font-semibold text-[#ffeed6] flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-[#93ec93]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Manual bill counts
        </h3>
        <p className="text-xs text-[#9fd6e9] opacity-80 mt-1">
          Enter the number of physical bills available this week. We'll respect these counts during distribution.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {DENOMINATION_FIELDS.map((field) => (
          <label key={field.key} className="flex flex-col bg-[#1E3535] rounded-md px-3 py-2 border border-[#3d6262]">
            <span className="text-xs font-medium text-[#ffeed6] mb-1">{field.label}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={value[field.key] ?? 0}
              onChange={(e) => updateValue(field.key, e.target.value)}
              className="bg-transparent text-[#f5f5f5] text-base font-semibold focus:outline-none focus:ring-2 focus:ring-[#93ec93] rounded"
            />
          </label>
        ))}
      </div>

      <div className="bg-[#1E3535] rounded-md px-3 py-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-[#9fd6e9]">Total from bills</span>
          <span className={`font-semibold ${totals.matches ? "text-[#93ec93]" : "text-[#dd7895]"}`}>
            ${totals.billTotal.toFixed(2)}
          </span>
        </div>
        {totalTipAmount !== "" && !totals.matches && (
          <p className="text-xs text-[#ffeed6] mt-2">
            {totals.difference > 0
              ? `You need ${totals.difference.toFixed(2)} more dollars in bills to match the total tips.`
              : `You have ${Math.abs(totals.difference).toFixed(2)} more dollars in bills than the total tips.`}
          </p>
        )}
      </div>
    </div>
  );
}
