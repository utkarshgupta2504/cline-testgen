package com.example.demo;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

/**
 * Intentionally under-covered: only one happy-path test exists.
 * The agent should add the missing cases (exceptions, boundaries, null, primes,
 * negatives/zero) following the 1 positive : 5 negative ratio.
 */
class CalculatorTest {

    private final Calculator calculator = new Calculator();

    @Test
    void divide_returnsQuotient_forPositiveInputs() {
        assertEquals(5, calculator.divide(10, 2));
    }
}
