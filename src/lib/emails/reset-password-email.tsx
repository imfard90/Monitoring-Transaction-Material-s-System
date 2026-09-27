import {
    Body,
    Button,
    Container,
    Head,
    Heading,
    Hr,
    Html,
    Preview,
    Section,
    Text,
} from '@react-email/components';

interface ResetPasswordEmailProps {
    url: string;
}

export const ResetPasswordEmail = ({ url }: ResetPasswordEmailProps) => {
    return (
        <Html>
            <Head />
            <Preview>Reset Password MTMS Anda</Preview>
            <Body style={main}>
                <Container style={container}>
                    <Heading style={h1}>Reset Password</Heading>
                    <Text style={text}>
                        Kami menerima permintaan untuk melakukan reset password akun MTMS Anda.
                        Silakan klik tombol di bawah ini untuk mengubah password Anda.
                    </Text>
                    <Section style={buttonContainer}>
                        <Button style={button} href={url}>
                            Reset Password
                        </Button>
                    </Section>
                    <Text style={text}>
                        Jika Anda tidak meminta perubahan password ini, silakan abaikan email ini.
                        Akun Anda akan tetap aman.
                    </Text>
                    <Text style={text}>
                        Atau, Anda dapat menyalin tautan berikut ke browser Anda:
                        <br />
                        <a href={url} style={link}>
                            {url}
                        </a>
                    </Text>
                    <Hr style={hr} />
                    <Text style={footer}>Abaikan email ini jika Anda tidak mendaftar di MTMS.</Text>
                </Container>
            </Body>
        </Html>
    );
};

export default ResetPasswordEmail;

const main = {
    backgroundColor: '#f6f9fc',
    fontFamily:
        '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
    backgroundColor: '#ffffff',
    margin: '0 auto',
    padding: '20px 0 48px',
    marginBottom: '64px',
};

const h1 = {
    color: '#333',
    fontSize: '24px',
    fontWeight: '600',
    lineHeight: '40px',
    margin: '0 0 20px',
    padding: '0 48px',
};

const text = {
    color: '#333',
    fontSize: '16px',
    lineHeight: '26px',
    padding: '0 48px',
};

const buttonContainer = {
    padding: '27px 48px 27px',
};

const button = {
    backgroundColor: '#e11d48', // using a distinct color (rose-600) for reset password
    borderRadius: '3px',
    color: '#fff',
    fontSize: '16px',
    textDecoration: 'none',
    textAlign: 'center' as const,
    display: 'block',
    padding: '12px',
};

const link = {
    color: '#e11d48',
    textDecoration: 'underline',
};

const hr = {
    borderColor: '#cccccc',
    margin: '20px 0',
};

const footer = {
    color: '#8898aa',
    fontSize: '12px',
    padding: '0 48px',
};
