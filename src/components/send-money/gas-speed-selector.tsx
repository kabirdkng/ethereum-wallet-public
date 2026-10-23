"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export type GasSpeed = 'slow' | 'normal' | 'fast' | 'instant';

interface GasSpeedOption {
  value: GasSpeed;
  multiplier: number;
  label: string;
  description: string;
  icon: string;
}

interface GasSpeedSelectorProps {
  selectedSpeed: GasSpeed;
  onSpeedChange: (speed: GasSpeed) => void;
  gasCostETH?: string;
}

export function GasSpeedSelector({ selectedSpeed, onSpeedChange, gasCostETH }: GasSpeedSelectorProps) {
  const t = useTranslations('send.gas');
  const [isExpanded, setIsExpanded] = useState(false);
  
  const gasSpeedOptions: GasSpeedOption[] = [
    {
      value: 'slow',
      multiplier: 0.8,
      label: t('slow'),
      description: t('slowDesc'),
      icon: '🐌'
    },
    {
      value: 'normal',
      multiplier: 1.0,
      label: t('normal'),
      description: t('normalDesc'),
      icon: '⚡'
    },
    {
      value: 'fast',
      multiplier: 1.3,
      label: t('fast'),
      description: t('fastDesc'),
      icon: '🚀'
    },
    {
      value: 'instant',
      multiplier: 1.6,
      label: t('instant'),
      description: t('instantDesc'),
      icon: '⚡⚡'
    }
  ];

  const calculateGasCost = (multiplier: number) => {
    if (!gasCostETH) return null;
    const baseCost = parseFloat(gasCostETH);
    const adjustedCost = baseCost * multiplier;
    return adjustedCost.toFixed(9); // 9 decimals for ETH
  };

  const selectedOption = gasSpeedOptions.find(opt => opt.value === selectedSpeed);

  if (!isExpanded) {
    return (
      <div className="flex items-center justify-between p-3 bg-background border border-default rounded-lg">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">{t('speed')}:</span>
          <span className="font-medium text-foreground">{selectedOption?.label || t('normal')}</span>
        </div>
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="text-sm text-primary hover:text-primary-hover font-medium transition-colors"
        >
          {t('change')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-foreground">
          {t('title')}
        </label>
        <button
          type="button"
          onClick={() => setIsExpanded(false)}
          className="text-sm text-muted hover:text-foreground transition-colors"
        >
          ✕
        </button>
      </div>
      
      <div className="grid grid-cols-2 gap-2">
        {gasSpeedOptions.map((option) => {
          const isSelected = selectedSpeed === option.value;
          const estimatedCost = calculateGasCost(option.multiplier);
          
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onSpeedChange(option.value);
                setIsExpanded(false);
              }}
              className={`p-3 border rounded-lg transition text-left ${
                isSelected
                  ? 'border-primary bg-primary/10'
                  : 'border-default hover:border-primary hover:bg-primary/5'
              }`}
            >
              <div className="flex items-start justify-between mb-1">
                <div>
                  <div className="font-medium text-sm flex items-center gap-1">
                    <span>{option.icon}</span>
                    <span>{option.label}</span>
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    {option.description}
                  </div>
                </div>
                {isSelected && (
                  <div className="text-primary text-lg">✓</div>
                )}
              </div>
              {estimatedCost && (
                <div className="text-xs text-muted mt-1 font-mono">
                  ~{estimatedCost} ETH
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Export gas multipliers for use in transaction logic
export const GAS_MULTIPLIERS: Record<GasSpeed, number> = {
  slow: 0.8,
  normal: 1.0,
  fast: 1.3,
  instant: 1.6
};
