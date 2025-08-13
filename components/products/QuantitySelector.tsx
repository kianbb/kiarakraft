'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Minus, Plus } from 'lucide-react';

interface QuantitySelectorProps {
  value: number;
  onChange: (value: number) => void;
  max?: number;
  min?: number;
  disabled?: boolean;
}

export function QuantitySelector({ 
  value, 
  onChange, 
  max = 99, 
  min = 1, 
  disabled = false 
}: QuantitySelectorProps) {
  const [inputValue, setInputValue] = useState(value.toString());

  const handleDecrease = () => {
    const newValue = Math.max(min, value - 1);
    onChange(newValue);
    setInputValue(newValue.toString());
  };

  const handleIncrease = () => {
    const newValue = Math.min(max, value + 1);
    onChange(newValue);
    setInputValue(newValue.toString());
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputVal = e.target.value;
    setInputValue(inputVal);
    
    const numVal = parseInt(inputVal);
    if (!isNaN(numVal) && numVal >= min && numVal <= max) {
      onChange(numVal);
    }
  };

  const handleInputBlur = () => {
    const numVal = parseInt(inputValue);
    if (isNaN(numVal) || numVal < min || numVal > max) {
      setInputValue(value.toString());
    }
  };

  return (
    <div className="flex items-center border rounded-md" role="group" aria-label="Quantity selector">
      <Button
        variant="ghost"
        size="icon"
        onClick={handleDecrease}
        disabled={disabled || value <= min}
        className="h-8 w-8 rounded-none"
        aria-label="Decrease quantity"
      >
        <Minus className="h-3 w-3" aria-hidden="true" />
      </Button>
      
      <Input
        type="number"
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleInputBlur}
        disabled={disabled}
        className="h-8 w-16 text-center border-0 border-l border-r rounded-none focus-visible:ring-0"
        min={min}
        max={max}
        aria-label="Quantity"
        role="spinbutton"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
      />
      
      <Button
        variant="ghost"
        size="icon"
        onClick={handleIncrease}
        disabled={disabled || value >= max}
        className="h-8 w-8 rounded-none"
        aria-label="Increase quantity"
      >
        <Plus className="h-3 w-3" aria-hidden="true" />
      </Button>
    </div>
  );
}