package com.example.demo;

/**
 * A deliberately branchy sample class so the agent has real uncovered behaviour
 * (exceptions, boundaries, null handling) to write negative tests against.
 */
public class Calculator {

    public int divide(int a, int b) {
        if (b == 0) {
            throw new IllegalArgumentException("division by zero");
        }
        return a / b;
    }

    public long factorial(int n) {
        if (n < 0) {
            throw new IllegalArgumentException("n must be >= 0");
        }
        long result = 1;
        for (int i = 2; i <= n; i++) {
            result *= i;
        }
        return result;
    }

    public boolean isPrime(int n) {
        if (n < 2) {
            return false;
        }
        for (int i = 2; (long) i * i <= n; i++) {
            if (n % i == 0) {
                return false;
            }
        }
        return true;
    }

    public String classify(Integer value) {
        if (value == null) {
            throw new NullPointerException("value must not be null");
        }
        if (value < 0) {
            return "negative";
        }
        if (value == 0) {
            return "zero";
        }
        return "positive";
    }
}
