import React from 'react';
import { Page, Card, Text, BlockStack, Button, Banner } from '@shopify/polaris';

export default function VATReturns() {
  return (
    <Page
      title="VAT Returns"
      subtitle="HMRC Making Tax Digital (MTD) filing"
      backAction={{ content: 'Dashboard', url: '/dashboard' }}
      primaryAction={{ content: 'Connect HMRC', url: '/auth/hmrc' }}
    >
      <BlockStack gap="400">
        <Banner title="Connect your HMRC account to get started" tone="info">
          <p>TaxEase UK will automatically calculate your VAT and file directly with HMRC via MTD.</p>
        </Banner>
        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd">VAT Return Periods</Text>
            <Text tone="subdued">Connect your HMRC account to view your VAT obligations and submit returns.</Text>
            <Button variant="primary" url="/auth/hmrc">Connect HMRC Account</Button>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
