import React from 'react';
import { Page, Card, Text, BlockStack, Button } from '@shopify/polaris';

export default function BankIntegration() {
  return (
    <Page
      title="Bank Integration"
      subtitle="Connect your bank or upload statements"
      backAction={{ content: 'Dashboard', url: '/dashboard' }}
    >
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd">🏦 Open Banking (Recommended)</Text>
            <Text tone="subdued">
              Connect your UK bank account via GoCardless Open Banking (PSD2).
              Live transaction feed with auto-categorisation.
            </Text>
            <Button variant="primary">Connect Bank Account</Button>
          </BlockStack>
        </Card>
        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd">📁 Upload Bank Statement</Text>
            <Text tone="subdued">
              Upload a CSV or PDF bank statement. We&apos;ll parse and categorise
              your transactions automatically.
            </Text>
            <Button>Upload Statement</Button>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
